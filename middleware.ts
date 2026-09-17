import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  createSessionToken,
  readSessionToken,
  renewalDue,
  sessionCookieMaxAge,
  signedInAtMs,
} from '@/lib/sessionToken';

/**
 * Keeps an ACTIVE session alive: re-issues the session cookie once it is a
 * few minutes old, so the one-hour idle timeout counts from the last use
 * rather than from sign-in. The original sign-in time rides along unchanged,
 * so the eight-hour absolute limit still holds (lib/sessionToken.ts).
 *
 * This runs on the edge and cannot read the database. That is safe because it
 * never decides who is signed in — getCurrentUser still re-reads the account
 * on every request, and judges sign-out-everywhere by the original sign-in
 * time, which renewal cannot move.
 */
export async function middleware(request: NextRequest) {
  const res = NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return res;

  // Sign-in, sign-out and password routes set or clear this cookie
  // themselves; renewing here too would race them for the Set-Cookie header.
  if (request.nextUrl.pathname.startsWith('/api/auth/')) return res;

  let session;
  try {
    session = await readSessionToken(token);
  } catch {
    return res; // AUTH_SECRET missing — the app treats this as signed out.
  }
  const now = Date.now();
  if (!session || !renewalDue(session, now)) return res;

  const authAtMs = signedInAtMs(session) ?? now;
  res.cookies.set(SESSION_COOKIE, await createSessionToken({ ...session, authAtMs }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionCookieMaxAge(authAtMs, now),
  });
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
