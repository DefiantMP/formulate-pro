import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SESSION_COOKIE } from '@/lib/auth';
import { getCurrentUser } from '@/lib/session';

/** End every session for your account, including this one — for a terminal
 *  you walked away from signed in, or a password you think someone saw. */
export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  await prisma.user.update({ where: { id: me.id }, data: { sessionsValidFrom: new Date() } });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
