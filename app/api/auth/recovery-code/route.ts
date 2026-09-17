import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { getCurrentUser } from '@/lib/session';
import { lockedMessage, lockMinutesRemaining, normaliseEmail, stateAfterFailure } from '@/lib/loginThrottle';
import { generateRecoveryCode, normaliseRecoveryCode } from '@/lib/recoveryCode';

/**
 * Create or replace your own recovery code. Requires your current password:
 * a session left open on a shared terminal must not be enough to swap in a
 * code someone else knows. Shares the sign-in throttle for the same reason.
 * The old code stops working immediately.
 */
export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.currentPassword !== 'string') {
    return NextResponse.json({ error: 'Your current password is required' }, { status: 400 });
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

  const code = generateRecoveryCode();
  await prisma.user.update({
    where: { id: me.id },
    data: { recoveryCodeHash: await hashPassword(normaliseRecoveryCode(code)), recoveryCodeCreatedAt: now },
  });
  if (throttle) await prisma.loginThrottle.deleteMany({ where: { email: key } });
  return NextResponse.json({ recoveryCode: code }, { status: 201 });
}
