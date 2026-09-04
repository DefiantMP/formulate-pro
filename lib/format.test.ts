import { describe, it, expect } from 'vitest';
import { fmt, fmtSigned } from './format';

describe('fmtSigned', () => {
  it('renders a negative delta as a negative number, not zero', () => {
    // Regression: fmt() clamps anything <= 0 to '0', which silently turned a
    // -50g stock adjustment into "0 g" in the lot history — a correction that
    // appeared to correct nothing.
    expect(fmt(-50, 2)).toBe('0'); // the clamp that caused it, pinned
    expect(fmtSigned(-50)).toBe('−50.00');
    expect(fmtSigned(-0.5)).toBe('−0.50');
  });

  it('marks a positive delta with a plus', () => {
    expect(fmtSigned(50)).toBe('+50.00');
  });

  it('renders zero without a sign', () => {
    expect(fmtSigned(0)).toBe('0.00');
  });

  it('survives a non-finite value', () => {
    expect(fmtSigned(Number.NaN)).toBe('0');
    expect(fmtSigned(Infinity)).toBe('0');
  });
});
