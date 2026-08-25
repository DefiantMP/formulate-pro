/**
 * Bucket fill target weight — the scale reading an operator should fill to
 * when counting tablets into an *untared* bucket.
 *
 * Deliberately plain arithmetic and deliberately NOT part of the calc
 * engine: nothing here feeds calculateFreshBatch/calculateRegrind, and no
 * blend math depends on it. It answers a packing-bench question ("what
 * number should the scale read?"), not a formulation one.
 */

export interface BucketFillInput {
  /** Target tablet quantity to put in the bucket. */
  tabletCount: number;
  /** Weight of a single tablet, in grams. */
  tabletWeightG: number;
  /** Tare weight of the empty bucket, in grams. */
  bucketWeightG: number;
}

export interface BucketFillResult {
  /** tabletCount x tabletWeightG — the tablets alone. */
  tabletSubtotalG: number;
  /** Echoed back so the breakdown line has both halves of the sum. */
  bucketWeightG: number;
  /** What the scale should read with the full, untared bucket on it. */
  targetScaleWeightG: number;
}

/**
 * target_scale_weight = bucket_weight + (tablet_count x tablet_unit_weight)
 *
 * Returns full precision; rounding to the 2-decimal scale precision used
 * elsewhere in the app is a display concern (see fmt(n, 2)), so that
 * rounding never compounds into a stored or re-used figure.
 */
export function calculateBucketFill(input: BucketFillInput): BucketFillResult {
  const tabletSubtotalG = input.tabletCount * input.tabletWeightG;
  return {
    tabletSubtotalG,
    bucketWeightG: input.bucketWeightG,
    targetScaleWeightG: tabletSubtotalG + input.bucketWeightG,
  };
}

/**
 * Blocking validation — a target computed from any of these is meaningless,
 * so the UI must not show a number at all until they all clear.
 */
export function validateBucketFill(input: BucketFillInput): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.tabletCount) || input.tabletCount <= 0) {
    errors.push('Tablet count must be greater than 0.');
  } else if (!Number.isInteger(input.tabletCount)) {
    errors.push('Tablet count must be a whole number of tablets.');
  }
  if (!Number.isFinite(input.tabletWeightG) || input.tabletWeightG <= 0) {
    errors.push('Tablet weight must be greater than 0 g.');
  }
  if (!Number.isFinite(input.bucketWeightG) || input.bucketWeightG <= 0) {
    errors.push('Bucket weight must be greater than 0 g.');
  }
  return errors;
}

/**
 * Sanity bounds for the non-blocking warnings below.
 *
 * These are PLACEHOLDERS, in the same sense as
 * DEFAULT_TOLERANCE_PERCENT in lib/scaleVerification.ts: they are shaped
 * like real operational limits but have not been checked against how
 * anyone actually fills a bucket on the floor. They exist to catch a
 * fat-fingered extra zero, not to describe real equipment. Revisit with an
 * operator before treating any of them as meaningful.
 */
export const TYPICAL_MIN_BUCKET_TABLETS = 100;
export const TYPICAL_MAX_BUCKET_TABLETS = 200_000;
/** Rough loaded capacity of a 5-gallon bucket of tablets, in grams. */
export const TYPICAL_MAX_BUCKET_LOAD_G = 30_000;

/**
 * Non-blocking sanity checks. Consistent with the rest of the app's input
 * warnings (e.g. RegrindResult.regroundPowderMismatch), these flag a
 * suspicious figure but never override or block it — the operator's number
 * stays authoritative.
 */
export function bucketFillWarnings(input: BucketFillInput): string[] {
  if (validateBucketFill(input).length > 0) return [];
  const warnings: string[] = [];
  if (input.tabletCount < TYPICAL_MIN_BUCKET_TABLETS) {
    warnings.push(
      `${input.tabletCount.toLocaleString()} tablets is unusually few for a bucket fill — double-check the count.`
    );
  }
  if (input.tabletCount > TYPICAL_MAX_BUCKET_TABLETS) {
    warnings.push(
      `${input.tabletCount.toLocaleString()} tablets is unusually many for a bucket fill — double-check the count.`
    );
  }
  const { tabletSubtotalG } = calculateBucketFill(input);
  if (tabletSubtotalG > TYPICAL_MAX_BUCKET_LOAD_G) {
    warnings.push(
      `That's ${(tabletSubtotalG / 1000).toFixed(1)} kg of tablets — heavier than a typical bucket holds. Consider splitting across buckets.`
    );
  }
  return warnings;
}
