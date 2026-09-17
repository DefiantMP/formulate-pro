import { SignJWT, jwtVerify } from 'jose';

/**
 * Session tokens — signing, reading, and the idle/absolute timeout rules.
 *
 * Kept free of bcrypt and Prisma so middleware.ts (edge runtime) can import
 * it to renew active sessions. Re-exported from lib/auth.ts.
 *
 * Two clocks:
 *  - IDLE: a token expires this long after it was last issued. Middleware
 *    re-issues it as the person uses the app, so activity keeps them in.
 *  - ABSOLUTE: counted from `authAtMs`, the original sign-in, which renewal
 *    carries forward unchanged. No amount of activity extends a session past
 *    it — roughly one shift.
 */

export const SESSION_COOKIE = 'fp_session';

/** An hour, not less: a 20-minute main mix with nobody touching the terminal
 *  must not sign the operator out halfway through a batch. */
export const SESSION_IDLE_SECONDS = 60 * 60;
/** Eight hours from sign-in — roughly one shift. An unattended floor terminal
 *  does not stay signed in overnight however it is used. */
export const SESSION_ABSOLUTE_SECONDS = 8 * 60 * 60;
/** Renew at most this often, so every request does not rewrite the cookie. */
export const SESSION_RENEW_AFTER_SECONDS = 5 * 60;

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  /** Issued-at, whole seconds (the standard JWT claim). Changes on every renewal. */
  iat?: number;
  /** Original sign-in, in MILLISECONDS. Never changes on renewal. Our own
   *  claim, so it is not limited to iat's whole seconds — which is what lets
   *  a cut-off end a session signed in earlier in the same second. */
  authAtMs?: number;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    // Failing loudly beats signing sessions with a guessable fallback: a
    // default secret in source would make every deployment's cookies
    // forgeable by anyone who can read the repo.
    throw new Error('AUTH_SECRET must be set to a random string of at least 32 characters.');
  }
  return new TextEncoder().encode(secret);
}

/** Sign a session. A fresh sign-in omits `authAtMs`; a renewal passes the
 *  original one through, which is what keeps the absolute cap absolute. */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const { userId, email, name, role } = payload;
  const authAtMs = payload.authAtMs ?? Date.now();
  return new SignJWT({ userId, email, name, role, authAtMs })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_IDLE_SECONDS}s`)
    .sign(secretKey());
}

/** Returns null for anything that does not verify — expired (idle), past the
 *  absolute cap, tampered, or signed with a different secret. */
export async function readSessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const { userId, email, name, role, iat, authAtMs } = payload as unknown as SessionPayload;
    if (!userId || !email) return null;
    const session = { userId, email, name, role, iat, authAtMs };
    if (pastAbsoluteLimit(signedInAtMs(session), Date.now())) return null;
    return session;
  } catch {
    return null;
  }
}

/** Original sign-in in ms; tokens issued before authAtMs existed fall back
 *  to their iat. */
export function signedInAtMs(session: Pick<SessionPayload, 'iat' | 'authAtMs'>): number | undefined {
  if (typeof session.authAtMs === 'number') return session.authAtMs;
  return typeof session.iat === 'number' ? session.iat * 1000 : undefined;
}

export function pastAbsoluteLimit(signedInMs: number | undefined, nowMs: number): boolean {
  if (typeof signedInMs !== 'number') return true;
  return nowMs - signedInMs >= SESSION_ABSOLUTE_SECONDS * 1000;
}

/** Whether middleware should re-issue this session now. */
export function renewalDue(payload: SessionPayload, nowMs: number): boolean {
  if (typeof payload.iat !== 'number') return false;
  if (pastAbsoluteLimit(signedInAtMs(payload), nowMs)) return false;
  return nowMs - payload.iat * 1000 >= SESSION_RENEW_AFTER_SECONDS * 1000;
}

/** Cookie lifetime in seconds: the idle window, but never past the absolute cap. */
export function sessionCookieMaxAge(signedInMs: number, nowMs: number): number {
  const remaining = Math.floor((signedInMs + SESSION_ABSOLUTE_SECONDS * 1000 - nowMs) / 1000);
  return Math.max(0, Math.min(SESSION_IDLE_SECONDS, remaining));
}

/**
 * Whether a session survives the account's `sessionsValidFrom` cut-off, set
 * on password reset, password change, "sign out everywhere" and deactivation.
 *
 * Compared against the ORIGINAL sign-in (`authAtMs`), not `iat`. Renewal
 * happens in middleware, which cannot read the database — so a cut-off
 * session would still be renewed, and comparing against its fresh `iat`
 * would resurrect it.
 *
 * Millisecond precision: an earlier version compared whole seconds and let a
 * session signed in during the same second as "sign out everywhere" survive
 * it. A sign-in at the exact cut-off millisecond is kept, which is what lets
 * a password change keep the session that made it. Legacy tokens without
 * authAtMs fall back to iat, rounded down to its second, and so are ended by
 * any cut-off in that second.
 */
export function sessionStillValid(
  session: Pick<SessionPayload, 'iat' | 'authAtMs'>,
  sessionsValidFrom: Date | null
): boolean {
  if (!sessionsValidFrom) return true;
  if (typeof session.authAtMs === 'number') return session.authAtMs >= sessionsValidFrom.getTime();
  if (typeof session.iat !== 'number') return false;
  return session.iat * 1000 > sessionsValidFrom.getTime();
}
