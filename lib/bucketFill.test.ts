import { describe, it, expect } from 'vitest';
import {
  calculateBucketFill,
  validateBucketFill,
  bucketFillWarnings,
  TYPICAL_MIN_BUCKET_TABLETS,
  TYPICAL_MAX_BUCKET_TABLETS,
} from './bucketFill';

describe('calculateBucketFill', () => {
  it('adds the tablet subtotal to the bucket tare', () => {
    const result = calculateBucketFill({ tabletCount: 5000, tabletWeightG: 0.69, bucketWeightG: 812.5 });
    expect(result.tabletSubtotalG).toBeCloseTo(3450, 6);
    expect(result.bucketWeightG).toBe(812.5);
    expect(result.targetScaleWeightG).toBeCloseTo(4262.5, 6);
  });

  it('uses the RR77-PB9 tablet weight and count consistently with the batch total', () => {
    // 10,887 tablets at the golden fixture's 0.69 g target tablet weight.
    const result = calculateBucketFill({ tabletCount: 10_887, tabletWeightG: 0.69, bucketWeightG: 0.01 });
    expect(result.tabletSubtotalG).toBeCloseTo(7512.03, 2);
  });

  it('does not round — rounding is left to the display layer', () => {
    const result = calculateBucketFill({ tabletCount: 3, tabletWeightG: 0.333, bucketWeightG: 0.001 });
    expect(result.targetScaleWeightG).toBeCloseTo(1.0, 10);
    // Raw float, noise and all — proof nothing rounds before display.
    expect(result.tabletSubtotalG).toBe(0.9990000000000001);
  });
});

describe('validateBucketFill', () => {
  const valid = { tabletCount: 5000, tabletWeightG: 0.69, bucketWeightG: 812.5 };

  it('accepts a well-formed input', () => {
    expect(validateBucketFill(valid)).toEqual([]);
  });

  it('rejects a non-positive or non-integer tablet count', () => {
    expect(validateBucketFill({ ...valid, tabletCount: 0 })).toHaveLength(1);
    expect(validateBucketFill({ ...valid, tabletCount: -5 })).toHaveLength(1);
    expect(validateBucketFill({ ...valid, tabletCount: 100.5 })[0]).toMatch(/whole number/);
  });

  it('rejects non-positive weights', () => {
    expect(validateBucketFill({ ...valid, tabletWeightG: 0 })).toHaveLength(1);
    expect(validateBucketFill({ ...valid, bucketWeightG: -1 })).toHaveLength(1);
    expect(validateBucketFill({ tabletCount: 0, tabletWeightG: 0, bucketWeightG: 0 })).toHaveLength(3);
  });

  it('rejects NaN, which parseFloat of an empty field produces', () => {
    expect(validateBucketFill({ ...valid, tabletWeightG: NaN })).toHaveLength(1);
  });
});

describe('bucketFillWarnings', () => {
  const valid = { tabletCount: 5000, tabletWeightG: 0.69, bucketWeightG: 812.5 };

  it('is silent for an ordinary bucket fill', () => {
    expect(bucketFillWarnings(valid)).toEqual([]);
  });

  it('warns but does not block on an unusually low count', () => {
    const warnings = bucketFillWarnings({ ...valid, tabletCount: TYPICAL_MIN_BUCKET_TABLETS - 1 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/unusually few/);
    // The figure is still computed — a warning never suppresses the target.
    expect(calculateBucketFill({ ...valid, tabletCount: 99 }).targetScaleWeightG).toBeGreaterThan(0);
  });

  it('warns on an unusually high count', () => {
    expect(bucketFillWarnings({ ...valid, tabletCount: TYPICAL_MAX_BUCKET_TABLETS + 1, tabletWeightG: 0.0001 })[0]).toMatch(
      /unusually many/
    );
  });

  it('warns when the tablets alone outweigh a typical bucket', () => {
    const warnings = bucketFillWarnings({ ...valid, tabletCount: 50_000 });
    expect(warnings.some((w) => /heavier than a typical bucket/.test(w))).toBe(true);
  });

  it('stays quiet while the input is still invalid, so errors aren\'t doubled up', () => {
    expect(bucketFillWarnings({ tabletCount: 0, tabletWeightG: 0.69, bucketWeightG: 812.5 })).toEqual([]);
  });
});
