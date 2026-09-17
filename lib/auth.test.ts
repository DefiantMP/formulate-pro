import { describe, it, expect, beforeAll } from 'vitest';
import {
  canReview,
  createSessionToken,
  hashPassword,
  isUserRole,
  passwordProblem,
  readSessionToken,
  sessionStillValid,
  verifyPassword,
  wouldRemoveLastAdmin,
} from './auth';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-must-be-at-least-32-characters-long';
});

describe('password hashing', () => {
  it('never stores the plaintext', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).not.toContain('correct-horse-battery');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(await verifyPassword('correct-horse-battery', hash)).toBe(true);
    expect(await verifyPassword('Correct-horse-battery', hash)).toBe(false);
  });

  it('salts — the same password hashes differently each time', async () => {
    // Otherwise identical passwords are identifiable across accounts.
    const [a, b] = await Promise.all([hashPassword('same-password-x'), hashPassword('same-password-x')]);
    expect(a).not.toBe(b);
  });
});

describe('password policy', () => {
  it('requires length rather than composition theatre', () => {
    expect(passwordProblem('short')).toMatch(/10 characters/);
    expect(passwordProblem('a-long-enough-one')).toBeNull();
  });
});

describe('roles', () => {
  it('lets only reviewers and admins sign off a batch', () => {
    // Separation of duties: the operator running a batch is not the person
    // who approves it.
    expect(canReview('operator')).toBe(false);
    expect(canReview('reviewer')).toBe(true);
    expect(canReview('admin')).toBe(true);
    expect(canReview('nonsense')).toBe(false);
  });

  it('validates the role vocabulary', () => {
    expect(isUserRole('operator')).toBe(true);
    expect(isUserRole('superuser')).toBe(false);
  });
});

describe('session tokens', () => {
  const payload = { userId: 'u1', email: 'a@b.com', name: 'A', role: 'operator' };

  it('round-trips a signed session', async () => {
    const token = await createSessionToken(payload);
    expect(await readSessionToken(token)).toMatchObject(payload);
  });

  it('rejects a tampered token', async () => {
    const token = await createSessionToken(payload);
    // Flip a character in the signature — a forged session must not resolve.
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(await readSessionToken(tampered)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await createSessionToken(payload);
    process.env.AUTH_SECRET = 'a-completely-different-secret-of-good-length';
    expect(await readSessionToken(token)).toBeNull();
    process.env.AUTH_SECRET = 'test-secret-must-be-at-least-32-characters-long';
  });

  it('treats a missing or junk token as signed out', async () => {
    expect(await readSessionToken(undefined)).toBeNull();
    expect(await readSessionToken('not-a-jwt')).toBeNull();
  });

  it('refuses to sign with a weak or absent secret', async () => {
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'too-short';
    // Failing loudly beats silently signing with a guessable key.
    await expect(createSessionToken(payload)).rejects.toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = original;
  });
});

describe('session cut-off after a reset or deactivation', () => {
  const cutoff = new Date('2026-09-17T12:00:00.500Z');
  const cutoffSec = Math.floor(cutoff.getTime() / 1000);

  it('keeps every session when no cut-off has ever been set', () => {
    expect(sessionStillValid(1, null)).toBe(true);
  });

  it('ends sessions issued before the cut-off', () => {
    expect(sessionStillValid(cutoffSec - 1, cutoff)).toBe(false);
  });

  it('keeps a sign-in in the same second as the cut-off, and any after it', () => {
    expect(sessionStillValid(cutoffSec, cutoff)).toBe(true);
    expect(sessionStillValid(cutoffSec + 60, cutoff)).toBe(true);
  });

  it('ends a session with no issued-at once a cut-off exists', () => {
    expect(sessionStillValid(undefined, cutoff)).toBe(false);
  });

  it('carries issued-at through a real signed token', async () => {
    const before = Math.floor(Date.now() / 1000);
    const read = await readSessionToken(
      await createSessionToken({ userId: 'u1', email: 'a@b.com', name: 'A', role: 'operator' })
    );
    expect(read?.iat).toBeGreaterThanOrEqual(before);
  });
});

describe('last-admin guard', () => {
  it('blocks removing the only active admin', () => {
    expect(wouldRemoveLastAdmin('admin', 1)).toBe(true);
    expect(wouldRemoveLastAdmin('admin', 0)).toBe(true);
  });

  it('allows it when another admin remains, and never blocks non-admins', () => {
    expect(wouldRemoveLastAdmin('admin', 2)).toBe(false);
    expect(wouldRemoveLastAdmin('reviewer', 1)).toBe(false);
    expect(wouldRemoveLastAdmin('operator', 0)).toBe(false);
  });
});
