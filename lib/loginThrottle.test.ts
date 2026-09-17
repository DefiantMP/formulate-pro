import { describe, expect, it } from 'vitest';
import {
  FAILURE_WINDOW_MS,
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  lockMinutesRemaining,
  lockedMessage,
  normaliseEmail,
  stateAfterFailure,
  type ThrottleState,
} from './loginThrottle';

const t0 = new Date('2026-09-17T09:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

function failTimes(n: number, gapMs = 1000): ThrottleState | null {
  let s: ThrottleState | null = null;
  for (let i = 0; i < n; i++) s = stateAfterFailure(s, at(i * gapMs));
  return s;
}

describe('login throttle', () => {
  it('normalises the typed email so case and spacing cannot dodge the count', () => {
    expect(normaliseEmail('  AChen@Example.com ')).toBe('achen@example.com');
  });

  it('does not lock before the limit', () => {
    const s = failTimes(MAX_FAILED_ATTEMPTS - 1);
    expect(s!.failedCount).toBe(MAX_FAILED_ATTEMPTS - 1);
    expect(lockMinutesRemaining(s, at(10_000))).toBe(0);
  });

  it('locks on the fifth failure for the full lockout', () => {
    const s = failTimes(MAX_FAILED_ATTEMPTS)!;
    const lastFailure = at((MAX_FAILED_ATTEMPTS - 1) * 1000);
    expect(s.lockedUntil!.getTime()).toBe(lastFailure.getTime() + LOCKOUT_MS);
    expect(lockMinutesRemaining(s, lastFailure)).toBe(15);
  });

  it('rounds the remaining time up, so it never reads "0 minutes" while still locked', () => {
    const s: ThrottleState = { failedCount: 5, firstFailedAt: t0, lockedUntil: at(30_000) };
    expect(lockMinutesRemaining(s, t0)).toBe(1);
    expect(lockedMessage(1)).toContain('1 minute,');
  });

  it('unlocks by itself once the lock has run out', () => {
    const s = failTimes(MAX_FAILED_ATTEMPTS)!;
    expect(lockMinutesRemaining(s, new Date(s.lockedUntil!.getTime()))).toBe(0);
  });

  it('starts counting again from one after a lock expires', () => {
    const s = failTimes(MAX_FAILED_ATTEMPTS)!;
    const next = stateAfterFailure(s, new Date(s.lockedUntil!.getTime() + 1));
    expect(next).toMatchObject({ failedCount: 1, lockedUntil: null });
  });

  it('forgets failures spread wider than the window', () => {
    const s = failTimes(MAX_FAILED_ATTEMPTS, FAILURE_WINDOW_MS / 2 + 1)!;
    expect(s.lockedUntil).toBeNull();
    expect(s.failedCount).toBeLessThan(MAX_FAILED_ATTEMPTS);
  });
});
