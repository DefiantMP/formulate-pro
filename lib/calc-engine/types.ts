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

/**
 * Purity of a fresh-batch active ingredient's raw material, expressed either
 * as a bulk percent (e.g. an assay result of 76.4%) or as mg of active per
 * gram of raw material (mirrors regrind's mg-per-old-tablet method). Either
 * way this resolves to a 0-1 fraction — see freshApiEffectivePotency.
 */
export type FreshApiPotency =
  | { method: 'bulkPercent'; percent: number }
  | { method: 'mgPerUnit'; mgPerUnit: number; unitWeightG: number };

/**
 * One active ingredient within a fresh-batch run. Combo products dose
 * multiple actives independently in the same tablet — each gets its own
 * label, target mg/tablet, and potency value, though the potency *method*
 * (bulk % vs mg/unit) is a single choice shared across every API in a run
 * (enforced by the UI, not by this type).
 */
export interface FreshApiEntry {
  id: string;
  label: string;
  targetActiveMgPerTablet: number;
  potency: FreshApiPotency;
}

export interface FreshApiResult {
  id: string;
  label: string;
  targetActiveMgPerTablet: number;
  /** Fraction (0-1) of this API's raw material that is active ingredient. */
  effectivePotency: number;
  /** % of total blend taken up by this API's raw material. */
  percentOfBlend: number;
  /** Grams of this API's raw material to weigh per run. */
  gramsPerRun: number;
}

/** Extensible list rather than a hardcoded boolean — more filler options are expected later. */
export const FRESH_FILLER_TYPES = ['Emdex', 'Dipac'] as const;
export type FreshFillerType = (typeof FRESH_FILLER_TYPES)[number];

export interface FreshBatchInput {
  tabletCount: number;
  targetWeightG: number;
  /** At least one API — a single-API run reduces exactly to today's single-active math. */
  apis: FreshApiEntry[];
  /**
   * Filler + fixed-% excipients only — must NOT include any role:'active'
   * entries; active ingredients are supplied via `apis` above instead.
   * Exactly one entry must have calculatedByDifference = true.
   */
  ingredients: IngredientLine[];
  /** Informational only — which filler was used (e.g. Emdex vs Dipac). Filler mass math is identical either way. */
  fillerType: FreshFillerType;
}

export interface FreshBatchResult {
  mode: 'fresh';
  tabletCount: number;
  targetWeightG: number;
  /** Combined target active mass per tablet, summed across all APIs. */
  targetActiveMgPerTablet: number;
  totalBlendG: number;
  apis: FreshApiResult[];
  /** Grams to weigh out, keyed by id — includes every API (by its id, same values as apis[].gramsPerRun) plus every non-API ingredient. */
  ingredientGrams: Record<string, number>;
  /** Resolved % of blend, keyed by id — same coverage as ingredientGrams, including the computed-by-difference one. */
  ingredientPercents: Record<string, number>;
  /** Combined % of blend taken up by every API's raw material together. */
  activePercentOfBlend: number;
  fillerType: FreshFillerType;
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
  /** Informational only — captured for record-keeping, does not affect calculation (e.g. EasyTab, Emdex). */
  fillerType: string;
  /** Informational only — how much of this lot's material is on hand, for a stock-shortage warning. Never affects calculation. */
  availableStockG: number | null;
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
  /** Informational only — carried through from RegrindLot for display in the UI/SOP. */
  fillerType: string;
  /** Informational only — carried through from RegrindLot, for a stock-shortage warning in the UI. */
  availableStockG: number | null;
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

/**
 * Solves for the weight of one unknown regrind lot, given a target tablet
 * count — the inverse of the normal regrind flow, where every lot weight is
 * known and regroundPowderG (hence tabletCount) is derived from it. Deliberately
 * a separate, standalone calculation: it produces a single lot weight, which
 * the caller then feeds back into the ordinary (unmodified) calculateRegrind
 * as ordinary lot data — so the two known-weight lots plus the solved one
 * flow through the exact same battle-tested math as any other regrind run.
 */
export interface RegrindSolveInput {
  /** Every lot except the one being solved for — must have a known weightG. */
  fixedLots: { weightG: number; potency: PotencyInput }[];
  /** Potency of the lot whose weight is unknown. */
  solvingLotPotency: PotencyInput;
  targetTabletCount: number;
  targetActiveMgPerTablet: number;
  targetWeightG: number;
}

export type RegrindSolveResult =
  | {
      ok: true;
      solvedWeightG: number;
      /** Sum of every fixed lot's weightG (excludes the solved lot). */
      fixedLotWeightSumG: number;
      /** target tablet count * targetWeightG. */
      totalBlendG: number;
      /** totalBlendG - fixedLotWeightSumG - solvedWeightG. */
      fillerAddG: number;
    }
  | { ok: false; reason: string };

export type CalcResult = FreshBatchResult | RegrindResult;

export interface VarianceRow {
  weightG: number;
  step: number;
  potencyMg: number;
}
