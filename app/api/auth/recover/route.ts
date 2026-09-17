import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  createSessionToken,
  hashPassword,
  passwordProblem,
  SESSION_COOKIE,
  SESSION_IDLE_SECONDS,
  verifyOrDummy,
} from '@/lib/auth';
import { lockedMessage, lockMinutesRemaining, normaliseEmail, stateAfterFailure } from '@/lib/loginThrottle';
import { generateRecoveryCode, isWellFormedRecoveryCode, normaliseRecoveryCode } from '@/lib/recoveryCode';

const WRONG = 'That email and recovery code do not match.';

/**
 * Forgotten password: email + recovery code + new password.
 *
 * Same protections as sign-in, because a recovery code IS a way in: shares
 * the per-email throttle, one message for unknown email vs wrong code, and a
 * bcrypt compare either way so timing reveals nothing. On success the code is
 * spent and replaced, every session ends, and this one is signed in — the new
 * code comes back in the response to be shown once.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.email !== 'string' || typeof body.code !== 'string' || typeof body.newPassword !== 'string') {
    return NextResponse.json({ error: 'Email, recovery code and a new password are required' }, { status: 400 });
  }

  // Checks that reveal nothing about any account, done before an attempt is
  // counted, so a typo in the new password does not cost a try.
  const pwProblem = passwordProblem(body.newPassword);
  if (pwProblem) return NextResponse.json({ error: pwProblem }, { status: 400 });
  if (!isWellFormedRecoveryCode(body.code)) {
    return NextResponse.json({ error: 'A recovery code is 16 letters and numbers, like K7QF-2MXR-9TDA-WP4H.' }, { status: 400 });
  }

  const key = normaliseEmail(body.email);
  const now = new Date();
  const throttle = await prisma.loginThrottle.findUnique({ where: { email: key } });
  const lockedFor = lockMinutesRemaining(throttle, now);
  if (lockedFor > 0) return NextResponse.json({ error: lockedMessage(lockedFor) }, { status: 429 });

  const user = await prisma.user.findFirst({ where: { email: key, deletedAt: null } });
  const ok = await verifyOrDummy(normaliseRecoveryCode(body.code), user?.recoveryCodeHash);
  if (!user || !ok) {
    const next = stateAfterFailure(throttle, now);
    await prisma.loginThrottle.upsert({ where: { email: key }, create: { email: key, ...next }, update: next });
    const nowLocked = lockMinutesRemaining(next, now);
    if (nowLocked > 0) return NextResponse.json({ error: lockedMessage(nowLocked) }, { status: 429 });
    return NextResponse.json({ error: WRONG }, { status: 400 });
  }

  const newCode = generateRecoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([
    hashPassword(body.newPassword),
    hashPassword(normaliseRecoveryCode(newCode)),
  ]);

  // Conditional on the hash still being the one just verified, so two
  // simultaneous uses of the same code cannot both succeed.
  const claimed = await prisma.$transaction(async (tx) => {
    const r = await tx.user.updateMany({
      where: { id: user.id, recoveryCodeHash: user.recoveryCodeHash },
      data: { passwordHash, recoveryCodeHash, recoveryCodeCreatedAt: now, sessionsValidFrom: now },
    });
    if (r.count === 1) await tx.loginThrottle.deleteMany({ where: { email: key } });
    return r.count === 1;
  });
  if (!claimed) return NextResponse.json({ error: WRONG }, { status: 400 });

  const res = NextResponse.json({ email: user.email, recoveryCode: newCode });
  res.cookies.set(
    SESSION_COOKIE,
    await createSessionToken({ userId: user.id, email: user.email, name: user.name, role: user.role }),
    { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_IDLE_SECONDS }
  );
  return res;
}
