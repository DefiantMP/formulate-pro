import bcrypt from 'bcryptjs';

/**
 * Password hashing and session tokens.
 *
 * bcrypt for hashing and jose for signing — both established libraries, no
 * hand-rolled crypto. jose is the same JWT implementation NextAuth uses
 * internally; NextAuth itself was not adopted because v5 is still beta and
 * brings provider/adapter configuration this single-company, single-database
 * tool has no use for.
 */

// Session tokens live in lib/sessionToken.ts (jose only, no bcrypt) so the
// edge middleware that renews idle sessions can import them. Re-exported here
// so existing imports keep working.
export {
  SESSION_COOKIE,
  SESSION_IDLE_SECONDS,
  SESSION_ABSOLUTE_SECONDS,
  createSessionToken,
  readSessionToken,
  sessionStillValid,
  sessionCookieMaxAge,
  type SessionPayload,
} from './sessionToken';

const BCRYPT_ROUNDS = 12;

export type UserRole = 'operator' | 'reviewer' | 'admin';
export const USER_ROLES: readonly UserRole[] = ['operator', 'reviewer', 'admin'];
export function isUserRole(v: unknown): v is UserRole {
  return typeof v === 'string' && (USER_ROLES as readonly string[]).includes(v);
}
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  operator: 'Operator',
  reviewer: 'Reviewer',
  admin: 'Admin',
};

/** Who may give a GMP review sign-off. Operators run batches; someone else
 *  signs them off — that separation is the point of the review step. */
export function canReview(role: string): boolean {
  return role === 'reviewer' || role === 'admin';
}

/** An admin may be demoted or deactivated only if another active admin
 *  remains — otherwise nobody could ever grant a role again. */
export function wouldRemoveLastAdmin(targetRole: string, activeAdminCount: number): boolean {
  return targetRole === 'admin' && activeAdminCount <= 1;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A real bcrypt hash of a string nobody uses, at the same cost as real ones.
const TIMING_DUMMY_HASH = '$2b$12$ujtW1mYbiAPFwZQJDKHuAeofXdDfDPQIzX0p2wf5iGE/1dHB2./G2';

/**
 * Compare against `hash`, or — when there is no account or no stored hash —
 * against a dummy, and return false. Skipping bcrypt for an unknown email
 * answered in ~4 ms instead of ~250 ms, which told anyone timing the sign-in
 * form which emails have accounts, however identical the error message was.
 */
export async function verifyOrDummy(plain: string, hash: string | null | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? TIMING_DUMMY_HASH);
  return !!hash && ok;
}

/**
 * Basic password policy. Deliberately minimal — length is the property that
 * actually matters, and a thicket of composition rules pushes people toward
 * predictable substitutions written on a sticky note by the press.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters.';
  return null;
}
