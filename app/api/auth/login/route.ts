import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, verifyPassword } from '@/lib/auth';
import { lockedMessage, lockMinutesRemaining, normaliseEmail, stateAfterFailure } from '@/lib/loginThrottle';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const { email, password } = body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const key = normaliseEmail(email);
  const now = new Date();
  // Checked BEFORE the password: a locked email gets no signal about whether
  // the guess was right. Throttled by the typed email, so an unknown address
  // locks exactly like a real one (see lib/loginThrottle.ts).
  const throttle = await prisma.loginThrottle.findUnique({ where: { email: key } });
  const lockedFor = lockMinutesRemaining(throttle, now);
  if (lockedFor > 0) {
    return NextResponse.json({ error: lockedMessage(lockedFor) }, { status: 429 });
  }

  const user = await prisma.user.findFirst({
    where: { email: key, deletedAt: null },
  });
  // One message for both "no such account" and "wrong password" — saying
  // which would let anyone enumerate who has an account here.
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    const next = stateAfterFailure(throttle, now);
    await prisma.loginThrottle.upsert({
      where: { email: key },
      create: { email: key, ...next },
      update: next,
    });
    const nowLocked = lockMinutesRemaining(next, now);
    if (nowLocked > 0) {
      return NextResponse.json({ error: lockedMessage(nowLocked) }, { status: 429 });
    }
    return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 });
  }
  if (throttle) await prisma.loginThrottle.delete({ where: { email: key } }).catch(() => undefined);

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  const res = NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
