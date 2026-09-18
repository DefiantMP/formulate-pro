import { describe, expect, it } from 'vitest';
import { INVITE_TTL_MS, inviteProblem, isInvitableRole, signupDecision } from './invites';

const now = new Date('2026-09-18T12:00:00Z');
const live = { email: 'Ana@Client.com', expiresAt: new Date(now.getTime() + INVITE_TTL_MS), usedAt: null, revokedAt: null };

describe('inviteProblem', () => {
  it('accepts a live invite for its own email, ignoring case and spaces', () => {
    expect(inviteProblem(live, ' ana@client.com ', now)).toBeNull();
  });

  // A forwarded link must not let someone sign up as themselves.
  it('refuses a different email', () => {
    expect(inviteProblem(live, 'someone@else.com', now)).toMatch(/different email/);
  });

  it('refuses unknown, used, cancelled and expired invites', () => {
    expect(inviteProblem(null, 'a@b.com', now)).toMatch(/not valid/);
    expect(inviteProblem({ ...live, usedAt: now }, 'ana@client.com', now)).toMatch(/already been used/);
    expect(inviteProblem({ ...live, revokedAt: now }, 'ana@client.com', now)).toMatch(/cancelled/);
    expect(inviteProblem({ ...live, expiresAt: now }, 'ana@client.com', now)).toMatch(/expired/);
  });

  it('lasts a week', () => {
    expect(INVITE_TTL_MS).toBe(7 * 24 * 3600 * 1000);
  });
});

describe('signupDecision', () => {
  it('lets the first person in without an invite, as admin, when no admin exists', () => {
    expect(signupDecision(0, null)).toEqual({ ok: true, role: 'admin' });
  });

  it('requires an invite once an admin exists', () => {
    expect(signupDecision(1, null)).toMatchObject({ ok: false, error: expect.stringMatching(/invitation/) });
  });

  it('passes on an invite problem', () => {
    expect(signupDecision(1, { problem: 'This invite has expired.', role: 'operator' })).toEqual({
      ok: false,
      error: 'This invite has expired.',
    });
  });

  it('takes the role from the invite, never admin', () => {
    expect(signupDecision(1, { problem: null, role: 'reviewer' })).toEqual({ ok: true, role: 'reviewer' });
    expect(signupDecision(1, { problem: null, role: 'admin' })).toEqual({ ok: true, role: 'operator' });
  });

  it('knows which roles can be invited', () => {
    expect(isInvitableRole('operator')).toBe(true);
    expect(isInvitableRole('reviewer')).toBe(true);
    expect(isInvitableRole('admin')).toBe(false);
  });
});
