/**
 * Sign-in attempt limiting — pure rules, DB-free like lib/gmp.ts.
 *
 * Keyed by the normalised email TYPED, not by account. Keying by account
 * would mean an unknown email is never locked while a real one is, and the
 * difference in response would tell anyone probing the form which emails
 * have accounts — the same enumeration the login route's single "Incorrect
 * email or password" message exists to prevent.
 *
 * Stored in the DB rather than in memory: the dev server restarts often, and
 * an in-memory counter would quietly reset with it.
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MS = 15 * 60 * 1000;

export interface ThrottleState {
  failedCount: number;
  firstFailedAt: Date | null;
  lockedUntil: Date | null;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Whole minutes left on a lock (rounded up), or 0 when not locked. Checked
 *  before the password is verified, so a locked email gets no answer about
 *  whether the password was right. */
export function lockMinutesRemaining(state: ThrottleState | null, now: Date): number {
  if (!state?.lockedUntil) return 0;
  const ms = state.lockedUntil.getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

/** The state to store after a failed attempt. A window that has lapsed, or a
 *  lock that has run out, starts counting again from one. */
export function stateAfterFailure(state: ThrottleState | null, now: Date): ThrottleState {
  const windowLapsed =
    !state?.firstFailedAt || now.getTime() - state.firstFailedAt.getTime() > FAILURE_WINDOW_MS;
  const lockExpired = !!state?.lockedUntil && state.lockedUntil.getTime() <= now.getTime();

  if (!state || windowLapsed || lockExpired) {
    return { failedCount: 1, firstFailedAt: now, lockedUntil: null };
  }
  const failedCount = state.failedCount + 1;
  return {
    failedCount,
    firstFailedAt: state.firstFailedAt,
    lockedUntil: failedCount >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : null,
  };
}

export function lockedMessage(minutes: number): string {
  return `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or ask an admin for a reset link.`;
}
