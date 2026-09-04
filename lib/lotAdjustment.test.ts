import { describe, it, expect } from 'vitest';
import { adjustmentError, resultingQuantity } from './lotAdjustment';

describe('adjustmentError', () => {
  it('accepts a negative correction that fits', () => {
    expect(adjustmentError({ deltaG: -50, reason: 'Spillage' }, 250)).toBeNull();
  });

  it('accepts a positive correction — reversing an over-entered draw-down', () => {
    // The case that motivated this table: a run recorded 250g when it used
    // 200g, and the 50g has to come back with a trace.
    expect(adjustmentError({ deltaG: 50, reason: 'Correction to a recorded run usage' }, 200)).toBeNull();
  });

  it('refuses a change that would take a lot below zero', () => {
    const e = adjustmentError({ deltaG: -300, reason: 'Recount' }, 250);
    expect(e).toMatch(/less than nothing/);
  });

  it('allows draining a lot to exactly zero', () => {
    expect(adjustmentError({ deltaG: -250, reason: 'Consumed' }, 250)).toBeNull();
  });

  it('refuses a zero adjustment rather than silently accepting it', () => {
    // A row that corrects nothing is noise in a log whose value is that every
    // row means something.
    expect(adjustmentError({ deltaG: 0, reason: 'Recount' }, 250)).toMatch(/records nothing/i);
  });

  it('demands a reason', () => {
    expect(adjustmentError({ deltaG: -10, reason: '   ' }, 250)).toMatch(/reason is required/i);
  });

  it('refuses a non-finite amount', () => {
    expect(adjustmentError({ deltaG: Number.NaN, reason: 'x' }, 250)).toMatch(/how much/i);
    expect(adjustmentError({ deltaG: Infinity, reason: 'x' }, 250)).toMatch(/how much/i);
  });
});

describe('resultingQuantity', () => {
  it('applies the signed delta', () => {
    expect(resultingQuantity(250, -50)).toBe(200);
    expect(resultingQuantity(250, 50)).toBe(300);
  });
});
