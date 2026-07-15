/**
 * Generalized ingredient/formulation types.
 *
 * The prototype hardcoded exactly 4 slots (active, Emdex, PVPP XL, MagSter).
 * This model keeps those as the *default* formulation while allowing any
 * manufacturer to define their own ingredient list, as long as the shape
 * rules below hold:
 *
 *  - Exactly one ingredient has role 'active'.
 *  - Exactly one ingredient has calculatedByDifference = true (the filler
 *    that absorbs whatever % of the blend is left over — Emdex today).
 *  - All other ingredients carry a fixed percentOfBlend for a given run.
 */

export type IngredientRole =
  | 'active'
  | 'diluent'
  | 'disintegrant'
  | 'lubricant'
  | 'other';

export interface IngredientLine {
  id: string;
  name: string;
  role: IngredientRole;
  /** % of total blend by weight for this run. Ignored if calculatedByDifference is true. */
  percentOfBlend: number | null;
  calculatedByDifference: boolean;
}

export interface FreshBatchInput {
  tabletCount: number;
  targetWeightG: number;
  targetActiveMgPerTablet: number;
  /**
   * Purity of the raw active-ingredient material, as a percent (0-100) —
   * e.g. a raw material assayed at 76.4% active. This is NOT the active
   * ingredient's % of the finished blend. The active ingredient's blend
   * percentage is derived from this plus targetActiveMgPerTablet and
   * targetWeightG (raw material mg needed per tablet = targetActiveMgPerTablet
   * / (potencyPercent / 100)), matching how regrind mode already works.
   * Any percentOfBlend set on the active ingredient in `ingredients` is
   * ignored — it is always computed internally.
   */
  potencyPercent: number;
  ingredients: IngredientLine[];
}

export interface FreshBatchResult {
  mode: 'fresh';
  tabletCount: number;
  targetWeightG: number;
  targetActiveMgPerTablet: number;
  totalBlendG: number;
  /** Grams to weigh out per ingredient, keyed by ingredient id. */
  ingredientGrams: Record<string, number>;
  /** Resolved % of blend per ingredient, including the computed-by-difference one. */
  ingredientPercents: Record<string, number>;
  activePercentOfBlend: number;
}

export type PotencyInput =
  | { method: 'bulkPercent'; percent: number }
  | { method: 'mgPerTablet'; mgPerOldTablet: number; oldTabletWeightG: number };

/**
 * One lot of ground-up old tablets within a regrind run. A regrind batch is
 * often a blend of multiple lots with different potencies, pressed weights,
 * and excipient makeups — see calculateRegrind for how these are blended.
 */
export interface RegrindLot {
  id: string;
  label: string;
  potency: PotencyInput;
  weightG: number;
  /** Informational only — captured for record-keeping, does not affect calculation. */
  disintegrantPercent: number | null;
  /** Informational only — captured for record-keeping, does not affect calculation. */
  lubricantPercent: number | null;
  /**
   * "Press starts" lots (inconsistent fill/compression before a press
   * stabilizes) have structurally unreliable potency figures — estimates,
   * not measurements. Flagging this never excludes the lot from the blended
   * calculation; it only marks the figure as low-confidence for review.
   */
  isStart: boolean;
  note: string;
}

export interface RegrindInput {
  /** At least one lot — a single-lot run reduces exactly to today's single-potency math. */
  lots: RegrindLot[];
  regroundPowderG: number;
  targetActiveMgPerTablet: number;
  targetWeightG: number;
  /** Name of the filler ingredient used to make up weight (e.g. Emdex). */
  fillerIngredientName: string;
  /** Names of ingredients NOT to add fresh, since they're already in the regrind powder. */
  alreadyPresentIngredientNames: string[];
}

export interface RegrindLotResult {
  id: string;
  label: string;
  /** Fraction (0-1) of this lot that is active ingredient. */
  effectivePotency: number;
  weightG: number;
  /** Grams of active ingredient contributed by this lot (weightG * effectivePotency). */
  activeContentG: number;
  isStart: boolean;
}

export interface RegrindResult {
  mode: 'regrind';
  lots: RegrindLotResult[];
  /** Sum of lots[].weightG, for cross-checking against the entered regroundPowderG. */
  lotWeightSum: number;
  /** True when regroundPowderG disagrees with lotWeightSum by more than a small tolerance. */
  regroundPowderMismatch: boolean;
  hasStartsLot: boolean;
  effectivePotency: number;
  regroundPowderG: number;
  targetActiveMgPerTablet: number;
  targetWeightG: number;
  tabletCount: number;
  totalBlendG: number;
  freshActiveG: number;
  fillerAddG: number;
  /** Grams of active ingredient already present across all lots (sum of lots[].activeContentG). */
  activeInOldPowderG: number;
  actualMgPerTablet: number;
  fillerIngredientName: string;
  alreadyPresentIngredientNames: string[];
}

export type CalcResult = FreshBatchResult | RegrindResult;

export interface VarianceRow {
  weightG: number;
  step: number;
  potencyMg: number;
}
