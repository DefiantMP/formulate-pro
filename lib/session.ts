import { cookies } from 'next/headers';
import { prisma } from './db';
import { readSessionToken, SESSION_COOKIE, sessionStillValid, type SessionPayload } from './auth';

/**
 * The signed-in user for the current request, or null.
 *
 * Re-reads the User row rather than trusting the cookie's copy: role and
 * deletedAt can change after a token was issued, and a signature must not be
 * accepted from an account that has since been archived or demoted. The
 * same re-read enforces sessionsValidFrom, which is what makes a password
 * reset or deactivation end sessions already issued.
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
    select: { id: true, name: true, email: true, role: true, sessionsValidFrom: true },
  });
  if (!user || !sessionStillValid(payload, user.sessionsValidFrom)) return null;
  const { sessionsValidFrom: _cutoff, ...rest } = user;
  return rest;
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

/**
 * The acting account for a write that must be attributable in GMP mode.
 * GMP on: a signed-in user, or an error naming the action. GMP off: whoever
 * is signed in, or null — a signed-out write is allowed and records nobody.
 */
export async function gmpActor(
  action: string
): Promise<{ ok: true; user: { id: string; name: string; email: string; role: string } | null } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  const { getGmpSettings } = await import('./gmpSettings');
  if (!user && (await getGmpSettings()).enabled) {
    return { ok: false, error: `GMP mode: sign in to ${action} — it is recorded against your account.` };
  }
  return { ok: true, user };
}
