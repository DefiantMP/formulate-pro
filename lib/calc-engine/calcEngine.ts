import type {
  FreshBatchInput,
  FreshBatchResult,
  RegrindInput,
  RegrindResult,
  RegrindLot,
  RegrindLotResult,
  PotencyInput,
  VarianceRow,
  IngredientLine,
} from './types';

/**
 * Validates the ingredient-shape rules the calc engine depends on.
 * Throws with a clear message rather than silently producing wrong grams.
 */
function validateIngredients(ingredients: IngredientLine[]): void {
  const actives = ingredients.filter((i) => i.role === 'active');
  if (actives.length !== 1) {
    throw new Error(
      `Expected exactly one ingredient with role 'active', found ${actives.length}.`
    );
  }
  const byDifference = ingredients.filter((i) => i.calculatedByDifference);
  if (byDifference.length !== 1) {
    throw new Error(
      `Expected exactly one ingredient with calculatedByDifference=true, found ${byDifference.length}.`
    );
  }
  for (const ing of ingredients) {
    // The active ingredient's percentOfBlend is always derived internally
    // (see calculateFreshBatch) rather than required as a direct input.
    if (ing.role === 'active' || ing.calculatedByDifference) continue;
    if (ing.percentOfBlend == null) {
      throw new Error(
        `Ingredient "${ing.name}" has no percentOfBlend and is not the calculated-by-difference ingredient.`
      );
    }
  }
}

/**
 * Fresh batch calculation. Generalized port of the prototype's calc() for
 * mode === 'fresh', with one correction from the original: the active
 * ingredient's % of blend is derived from raw-material potency, not taken
 * as a direct input — see FreshBatchInput.potencyPercent and
 * tests/calcEngine.test.ts.
 */
export function calculateFreshBatch(input: FreshBatchInput): FreshBatchResult | null {
  const { tabletCount, targetWeightG, targetActiveMgPerTablet, potencyPercent, ingredients } = input;
  validateIngredients(ingredients);

  const filler = ingredients.find((i) => i.calculatedByDifference)!;

  if (
    potencyPercent <= 0 ||
    targetActiveMgPerTablet <= 0 ||
    targetWeightG <= 0 ||
    tabletCount <= 0
  ) {
    return null;
  }

  // How much of the (impure) raw material is needed per tablet to deliver
  // targetActiveMgPerTablet of actual active ingredient, then expressed as
  // that raw material's % of the finished tablet's total weight.
  const rawMaterialMgPerTablet = targetActiveMgPerTablet / (potencyPercent / 100);
  const activePercent = (rawMaterialMgPerTablet / (targetWeightG * 1000)) * 100;

  const fixedPercentSum =
    activePercent +
    ingredients
      .filter((i) => !i.calculatedByDifference && i.role !== 'active')
      .reduce((sum, i) => sum + (i.percentOfBlend ?? 0), 0);
  const fillerPercent = Math.max(0, 100 - fixedPercentSum);

  const totalBlendG = tabletCount * targetWeightG;

  const ingredientPercents: Record<string, number> = {};
  const ingredientGrams: Record<string, number> = {};
  for (const ing of ingredients) {
    let pct: number;
    if (ing.calculatedByDifference) pct = fillerPercent;
    else if (ing.role === 'active') pct = activePercent;
    else pct = ing.percentOfBlend ?? 0;
    ingredientPercents[ing.id] = pct;
    ingredientGrams[ing.id] = totalBlendG * (pct / 100);
  }

  return {
    mode: 'fresh',
    tabletCount,
    targetWeightG,
    targetActiveMgPerTablet,
    totalBlendG,
    ingredientGrams,
    ingredientPercents,
    activePercentOfBlend: activePercent,
  };
}

/** Resolves a lot's potency input (bulk % or mg-per-tablet) to a 0-1 active fraction. */
function lotEffectivePotency(potency: PotencyInput): number {
  if (potency.method === 'bulkPercent') {
    return potency.percent / 100;
  }
  if (potency.mgPerOldTablet > 0 && potency.oldTabletWeightG > 0) {
    return potency.mgPerOldTablet / (potency.oldTabletWeightG * 1000);
  }
  return 0;
}

/**
 * A mismatch between the entered total and the lot-weight sum is only ever
 * surfaced as a warning (see RegrindResult.regroundPowderMismatch) — the
 * entered regroundPowderG remains the authoritative scale reading that
 * drives every downstream calculation, exactly as before lots existed.
 */
const POWDER_WEIGHT_MISMATCH_TOLERANCE_G = 0.01;

/**
 * Regrind calculation. Generalized port of the prototype's calc() for
 * mode === 'regrind', covering both potency-input methods (bulk % / mg-per-tablet),
 * now blended across one or more lots. With a single lot whose weightG equals
 * regroundPowderG, effectivePotency reduces to exactly that lot's own potency
 * fraction — identical output to the original single-potency formula.
 */
export function calculateRegrind(input: RegrindInput): RegrindResult | null {
  const {
    lots,
    regroundPowderG,
    targetActiveMgPerTablet,
    targetWeightG,
    fillerIngredientName,
    alreadyPresentIngredientNames,
  } = input;

  const lotResults: RegrindLotResult[] = lots.map((lot: RegrindLot) => {
    const lotPotency = lotEffectivePotency(lot.potency);
    const activeContentG = lot.weightG > 0 && lotPotency > 0 ? lot.weightG * lotPotency : 0;
    return {
      id: lot.id,
      label: lot.label,
      effectivePotency: lotPotency,
      weightG: lot.weightG,
      activeContentG,
      isStart: lot.isStart,
    };
  });

  const activeInOldPowderG = lotResults.reduce((sum, l) => sum + l.activeContentG, 0);
  const lotWeightSum = lotResults.reduce((sum, l) => sum + l.weightG, 0);
  const regroundPowderMismatch =
    regroundPowderG > 0 &&
    lotWeightSum > 0 &&
    Math.abs(regroundPowderG - lotWeightSum) > POWDER_WEIGHT_MISMATCH_TOLERANCE_G;
  const hasStartsLot = lotResults.some((l) => l.isStart);

  const effectivePotency = regroundPowderG > 0 ? activeInOldPowderG / regroundPowderG : 0;

  if (
    effectivePotency <= 0 ||
    regroundPowderG <= 0 ||
    targetActiveMgPerTablet <= 0 ||
    targetWeightG <= 0
  ) {
    return null;
  }

  const tabletCount = Math.floor(
    (regroundPowderG * effectivePotency * 1000) / targetActiveMgPerTablet
  );
  const regrindPerTabletG = targetActiveMgPerTablet / (effectivePotency * 1000);
  const fillerPerTabletG = targetWeightG - regrindPerTabletG;
  const fillerAddG = Math.max(0, tabletCount * fillerPerTabletG);
  const freshActiveG = Math.max(
    0,
    (tabletCount * targetActiveMgPerTablet) / 1000 - activeInOldPowderG
  );
  const totalBlendG = regroundPowderG + freshActiveG + fillerAddG;
  const actualMgPerTablet =
    tabletCount > 0 ? ((activeInOldPowderG + freshActiveG) * 1000) / tabletCount : 0;

  return {
    mode: 'regrind',
    lots: lotResults,
    lotWeightSum,
    regroundPowderMismatch,
    hasStartsLot,
    effectivePotency,
    regroundPowderG,
    targetActiveMgPerTablet,
    targetWeightG,
    tabletCount,
    totalBlendG,
    freshActiveG,
    fillerAddG,
    activeInOldPowderG,
    actualMgPerTablet,
    fillerIngredientName,
    alreadyPresentIngredientNames,
  };
}

/**
 * +/- 3 step variance table around target tablet weight, same as the prototype.
 * Mode-agnostic: works off targetWeightG + targetActiveMgPerTablet from either result.
 */
export function generateVarianceTable(
  targetWeightG: number,
  targetActiveMgPerTablet: number
): VarianceRow[] {
  const rows: VarianceRow[] = [];
  for (let step = -3; step <= 3; step++) {
    const weightG = targetWeightG + step * 0.005;
    const potencyMg =
      targetWeightG > 0 ? (weightG / targetWeightG) * targetActiveMgPerTablet : 0;
    rows.push({
      weightG: round(weightG, 3),
      step,
      potencyMg: round(potencyMg, 3),
    });
  }
  return rows;
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
