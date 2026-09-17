import { describe, it, expect, beforeAll } from 'vitest';
import {
  canReview,
  createSessionToken,
  hashPassword,
  isUserRole,
  passwordProblem,
  readSessionToken,
  verifyOrDummy,
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

describe('verifyOrDummy', () => {
  it('matches a real hash and rejects a wrong password', async () => {
    const hash = await hashPassword('the-real-password');
    expect(await verifyOrDummy('the-real-password', hash)).toBe(true);
    expect(await verifyOrDummy('not-it-at-all', hash)).toBe(false);
  });

  it('is false with no hash, even for the dummy string itself', async () => {
    expect(await verifyOrDummy('formulate-pro-timing-dummy-never-a-real-password', null)).toBe(false);
    expect(await verifyOrDummy('anything', undefined)).toBe(false);
  });

  // Regression: skipping bcrypt for an unknown email answered ~60x faster,
  // revealing which emails have accounts.
  it('takes bcrypt time even when there is no account', async () => {
    const hash = await hashPassword('the-real-password');
    const t0 = performance.now();
    await verifyOrDummy('guess', hash);
    const withAccount = performance.now() - t0;
    const t1 = performance.now();
    await verifyOrDummy('guess', null);
    const withoutAccount = performance.now() - t1;
    expect(withoutAccount).toBeGreaterThan(withAccount * 0.5);
  });
});
