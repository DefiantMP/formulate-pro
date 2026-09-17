import { describe, expect, it } from 'vitest';
import { RESET_TOKEN_TTL_MS, generateResetToken, hashResetToken, resetTokenProblem } from './passwordReset';

const now = new Date('2026-09-17T09:00:00Z');
const live = {
  expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
  usedAt: null,
  revokedAt: null,
  userDeleted: false,
};

describe('reset tokens', () => {
  it('are long, URL-safe and different every time', () => {
    const a = generateResetToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateResetToken()).not.toBe(a);
  });

  it('are stored as a stable hash that is not the token itself', () => {
    const t = generateResetToken();
    expect(hashResetToken(t)).toBe(hashResetToken(t));
    expect(hashResetToken(t)).not.toContain(t);
    expect(hashResetToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accept a live, unused link', () => {
    expect(resetTokenProblem(live, now)).toBeNull();
  });

  it('refuse unknown, used, replaced, expired links and deactivated accounts', () => {
    expect(resetTokenProblem(null, now)).toMatch(/not valid/);
    expect(resetTokenProblem({ ...live, usedAt: now }, now)).toMatch(/already been used/);
    expect(resetTokenProblem({ ...live, revokedAt: now }, now)).toMatch(/replaced/);
    expect(resetTokenProblem({ ...live, userDeleted: true }, now)).toMatch(/deactivated/);
    expect(resetTokenProblem({ ...live, expiresAt: now }, now)).toMatch(/expired/);
  });

  it('expire after one hour', () => {
    expect(RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
  });
});
