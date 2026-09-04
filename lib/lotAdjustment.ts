/**
 * Rules for correcting a lot's remaining quantity.
 *
 * Pure, like the rest of the inventory and GMP rules, so what is and is not a
 * legal correction can be read without opening a route handler.
 */

export interface AdjustmentInput {
  deltaG: number;
  reason: string;
}

/** Common reasons, offered in the UI. Free text is still accepted — this is a
 *  convenience list, not a closed set, because the real world produces
 *  reasons no enum anticipated. */
export const ADJUSTMENT_REASONS = [
  'Physical recount',
  'Spillage / loss',
  'QC sampling',
  'Correction to a recorded run usage',
  'Returned to stock',
] as const;

/**
 * Why an adjustment is refused, or null if it is fine.
 *
 * A zero delta is rejected rather than ignored: it records a correction that
 * corrects nothing, which is noise in a log whose whole value is that every
 * row means something.
 */
export function adjustmentError(
  input: AdjustmentInput,
  currentRemainingG: number
): string | null {
  if (typeof input.deltaG !== 'number' || !Number.isFinite(input.deltaG)) {
    return 'Enter how much to add or remove, in grams.';
  }
  if (input.deltaG === 0) {
    return 'An adjustment of zero records nothing — enter a positive or negative amount.';
  }
  if (!input.reason.trim()) {
    return 'A reason is required — an unexplained stock change is not a record.';
  }
  const resulting = currentRemainingG + input.deltaG;
  if (resulting < 0) {
    return `That would leave ${resulting.toFixed(2)}g. A lot cannot hold less than nothing — only ${currentRemainingG.toFixed(2)}g remains.`;
  }
  return null;
}

/** What the lot will hold once applied. */
export function resultingQuantity(currentRemainingG: number, deltaG: number): number {
  return currentRemainingG + deltaG;
}
