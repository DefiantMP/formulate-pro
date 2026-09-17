import { createHash, randomBytes } from 'crypto';

/**
 * Admin-issued, one-time password reset links — pure rules.
 *
 * There is no email in this app, so a reset cannot be self-service: an admin
 * generates a link for a specific person and hands it over. The link is a
 * password-equivalent while it is live, which is why it is short-lived,
 * single-use, and stored only as a hash — a copy of the database must not be
 * enough to take over an account.
 */

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** 32 random bytes, URL-safe. Returned to the admin once and never stored. */
export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 rather than bcrypt: the token is 256 bits of randomness, so there
 *  is nothing to brute-force, and the lookup has to be by exact hash. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface ResetTokenState {
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  userDeleted: boolean;
}

/** Why a reset link cannot be used, or null if it can. */
export function resetTokenProblem(token: ResetTokenState | null, now: Date): string | null {
  if (!token) return 'This reset link is not valid. Ask an admin for a new one.';
  if (token.usedAt) return 'This reset link has already been used. Ask an admin for a new one.';
  if (token.revokedAt) return 'This reset link was replaced by a newer one. Use the latest link, or ask an admin.';
  if (token.userDeleted) return 'This account has been deactivated.';
  if (token.expiresAt.getTime() <= now.getTime()) return 'This reset link has expired. Ask an admin for a new one.';
  return null;
}
