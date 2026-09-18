/**
 * Invite-only accounts — pure rules, DB-free like lib/passwordReset.ts.
 *
 * Open signup meant anyone who could reach the app got an account, and every
 * account can see every run, formulation and lot. Before the app is put
 * anywhere a client can reach it, accounts must come from an admin.
 *
 * An invite is a one-time link bound to ONE email: the person who opens it can
 * create that account and no other, so a forwarded link cannot be used to
 * sign up as someone else. Only its SHA-256 is stored (tokens are generated
 * and hashed with the same helpers as password reset links).
 *
 * The single exception is bootstrap: an instance with no active admin lets
 * one person sign up without an invite and become admin — otherwise a fresh
 * install (a new sandbox, say) could never get its first account.
 */

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Invites grant one of these. Admin is deliberately absent: it is given by
 *  promoting an existing account, never handed out in a link. */
export const INVITABLE_ROLES = ['operator', 'reviewer'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(v: unknown): v is InvitableRole {
  return typeof v === 'string' && (INVITABLE_ROLES as readonly string[]).includes(v);
}

export interface InviteState {
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/** Why an invite cannot be used for this email, or null if it can. */
export function inviteProblem(invite: InviteState | null, email: string, now: Date): string | null {
  if (!invite) return 'This invite link is not valid. Ask an admin for a new one.';
  if (invite.usedAt) return 'This invite has already been used.';
  if (invite.revokedAt) return 'This invite was cancelled. Ask an admin for a new one.';
  if (invite.expiresAt.getTime() <= now.getTime()) return 'This invite has expired. Ask an admin for a new one.';
  if (normaliseInviteEmail(invite.email) !== normaliseInviteEmail(email)) {
    return 'This invite is for a different email address.';
  }
  return null;
}

export function normaliseInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Whether a signup may go ahead, and with which role.
 *  - No active admin (bootstrap): allowed without an invite, becomes admin.
 *  - Otherwise: an invite is required, and it decides the role.
 */
export function signupDecision(
  activeAdminCount: number,
  invite: { problem: string | null; role: string } | null
): { ok: true; role: 'admin' | InvitableRole } | { ok: false; error: string } {
  if (activeAdminCount === 0) return { ok: true, role: 'admin' };
  if (!invite) return { ok: false, error: 'Accounts are by invitation. Ask an admin for an invite link.' };
  if (invite.problem) return { ok: false, error: invite.problem };
  return { ok: true, role: isInvitableRole(invite.role) ? invite.role : 'operator' };
}
