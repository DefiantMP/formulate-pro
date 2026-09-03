import { cookies } from 'next/headers';
import { prisma } from './db';
import { readSessionToken, SESSION_COOKIE, type SessionPayload } from './auth';

/**
 * The signed-in user for the current request, or null.
 *
 * Re-reads the User row rather than trusting the cookie's copy: role and
 * deletedAt can change after a token was issued, and a signature must not be
 * accepted from an account that has since been archived or demoted.
 */
export async function getCurrentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  let payload: SessionPayload | null = null;
  try {
    payload = await readSessionToken(token);
  } catch {
    // AUTH_SECRET missing — treat as signed out rather than 500ing every
    // page, since with GMP mode off the app is usable without an account.
    return null;
  }
  if (!payload) return null;
  const user = await prisma.user.findFirst({
    where: { id: payload.userId, deletedAt: null },
    select: { id: true, name: true, email: true, role: true },
  });
  return user ?? null;
}

/** For GMP-gated writes: the acting user, or an error explaining the block. */
export async function requireUser(): Promise<
  { ok: true; user: { id: string; name: string; email: string; role: string } } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: 'GMP mode: sign in to record this — actions must be attributable to an account.' };
  }
  return { ok: true, user };
}
