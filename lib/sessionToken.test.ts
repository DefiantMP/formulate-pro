import { beforeAll, describe, expect, it, vi, afterEach } from 'vitest';
import {
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
  SESSION_RENEW_AFTER_SECONDS,
  createSessionToken,
  pastAbsoluteLimit,
  readSessionToken,
  renewalDue,
  sessionCookieMaxAge,
  sessionStillValid,
  signedInAtMs,
} from './sessionToken';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-must-be-at-least-32-characters-long';
});
afterEach(() => {
  vi.useRealTimers();
});

const base = { userId: 'u1', email: 'a@b.com', name: 'A', role: 'operator' };
const T0 = new Date('2026-09-17T08:00:00Z');
const sec = (d: Date) => Math.floor(d.getTime() / 1000);

describe('timeouts', () => {
  it('uses an hour idle and an eight-hour absolute limit', () => {
    expect(SESSION_IDLE_SECONDS).toBe(3600);
    expect(SESSION_ABSOLUTE_SECONDS).toBe(8 * 3600);
  });

  it('expires a token left idle past the window', async () => {
    vi.useFakeTimers({ now: T0 });
    const token = await createSessionToken(base);
    vi.setSystemTime(new Date(T0.getTime() + (SESSION_IDLE_SECONDS - 60) * 1000));
    expect(await readSessionToken(token)).not.toBeNull();
    vi.setSystemTime(new Date(T0.getTime() + (SESSION_IDLE_SECONDS + 60) * 1000));
    expect(await readSessionToken(token)).toBeNull();
  });

  it('carries the original sign-in through a renewal, so activity cannot pass the absolute limit', async () => {
    vi.useFakeTimers({ now: T0 });
    const first = await readSessionToken(await createSessionToken(base));
    expect(first!.authAtMs).toBe(T0.getTime());

    // Renewed seven and a half hours in, as middleware would.
    const later = new Date(T0.getTime() + 7.5 * 3600 * 1000);
    vi.setSystemTime(later);
    const renewed = await createSessionToken(first!);
    const read = await readSessionToken(renewed);
    expect(read!.authAtMs).toBe(T0.getTime());
    expect(read!.iat).toBe(sec(later));

    // Still inside its own idle window, but past eight hours from sign-in.
    vi.setSystemTime(new Date(T0.getTime() + (SESSION_ABSOLUTE_SECONDS + 60) * 1000));
    expect(await readSessionToken(renewed)).toBeNull();
  });

  it('renews only after a few minutes, and never past the absolute limit', () => {
    const now = T0.getTime() + 3600_000;
    const nowS = Math.floor(now / 1000);
    expect(renewalDue({ ...base, iat: nowS - 60, authAtMs: T0.getTime() }, now)).toBe(false);
    expect(renewalDue({ ...base, iat: nowS - SESSION_RENEW_AFTER_SECONDS, authAtMs: T0.getTime() }, now)).toBe(true);
    expect(renewalDue({ ...base, iat: nowS - 600, authAtMs: now - SESSION_ABSOLUTE_SECONDS * 1000 }, now)).toBe(false);
    expect(pastAbsoluteLimit(undefined, now)).toBe(true);
    expect(signedInAtMs({ iat: 100 })).toBe(100_000);
  });

  it('never sets a cookie that outlives the absolute limit', () => {
    const at = T0.getTime();
    expect(sessionCookieMaxAge(at, at)).toBe(SESSION_IDLE_SECONDS);
    expect(sessionCookieMaxAge(at, at + (SESSION_ABSOLUTE_SECONDS - 600) * 1000)).toBe(600);
    expect(sessionCookieMaxAge(at, at + (SESSION_ABSOLUTE_SECONDS + 5) * 1000)).toBe(0);
  });
});

describe('session cut-off (reset, password change, sign out everywhere, deactivation)', () => {
  const cutoff = new Date('2026-09-17T12:00:00.500Z');
  const cutoffMs = cutoff.getTime();

  it('keeps every session when no cut-off has ever been set', () => {
    expect(sessionStillValid({ authAtMs: 1 }, null)).toBe(true);
  });

  it('ends a session signed in earlier in the SAME second as the cut-off', () => {
    // Regression: whole-second comparison let this survive "sign out everywhere".
    expect(sessionStillValid({ authAtMs: cutoffMs - 200 }, cutoff)).toBe(false);
  });

  it('keeps a sign-in at or after the cut-off — how a password change keeps its own session', () => {
    expect(sessionStillValid({ authAtMs: cutoffMs }, cutoff)).toBe(true);
    expect(sessionStillValid({ authAtMs: cutoffMs + 1 }, cutoff)).toBe(true);
  });

  // The trap: middleware renews without reading the DB, so a cut-off session
  // still gets a fresh iat. Judging it by iat would bring it back to life.
  it('judges by original sign-in, so a renewal after the cut-off does not resurrect a session', () => {
    expect(sessionStillValid({ authAtMs: cutoffMs - 3600_000, iat: Math.floor(cutoffMs / 1000) + 300 }, cutoff)).toBe(false);
  });

  it('ends legacy iat-only tokens from the cut-off second or before, and refuses a token with neither', () => {
    const cutoffSec = Math.floor(cutoffMs / 1000);
    expect(sessionStillValid({ iat: cutoffSec + 1 }, cutoff)).toBe(true);
    expect(sessionStillValid({ iat: cutoffSec }, cutoff)).toBe(false);
    expect(sessionStillValid({}, cutoff)).toBe(false);
  });
});
