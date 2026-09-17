import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  createSessionToken,
  hashPassword,
  passwordProblem,
  SESSION_COOKIE,
  SESSION_IDLE_SECONDS,
  verifyPassword,
} from '@/lib/auth';
import { getCurrentUser } from '@/lib/session';
import { lockedMessage, lockMinutesRemaining, normaliseEmail, stateAfterFailure } from '@/lib/loginThrottle';

/**
 * Change your own password. Requires the current one — a session left open
 * on a shared floor terminal must not be enough to take the account over —
 * and that check shares the sign-in throttle, so it cannot be used to guess
 * the password around the lock.
 *
 * Ends every other session for the account and re-issues this one, so the
 * person changing it stays signed in here.
 */
export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') {
    return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 });
  }

  const key = normaliseEmail(me.email);
  const now = new Date();
  const throttle = await prisma.loginThrottle.findUnique({ where: { email: key } });
  const lockedFor = lockMinutesRemaining(throttle, now);
  if (lockedFor > 0) return NextResponse.json({ error: lockedMessage(lockedFor) }, { status: 429 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
    const next = stateAfterFailure(throttle, now);
    await prisma.loginThrottle.upsert({ where: { email: key }, create: { email: key, ...next }, update: next });
    const nowLocked = lockMinutesRemaining(next, now);
    if (nowLocked > 0) return NextResponse.json({ error: lockedMessage(nowLocked) }, { status: 429 });
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
  }

  const pwProblem = passwordProblem(body.newPassword);
  if (pwProblem) return NextResponse.json({ error: pwProblem }, { status: 400 });
  if (await verifyPassword(body.newPassword, user.passwordHash)) {
    return NextResponse.json({ error: 'The new password must be different from the current one.' }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: me.id },
      data: { passwordHash: await hashPassword(body.newPassword), sessionsValidFrom: now },
    }),
    prisma.loginThrottle.deleteMany({ where: { email: key } }),
  ]);

  // A fresh sign-in time at or after the cut-off keeps THIS session valid.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken({ userId: me.id, email: me.email, name: me.name, role: me.role }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_IDLE_SECONDS,
  });
  return res;
}
