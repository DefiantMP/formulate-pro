import type {
  FreshBatchInput,
  FreshBatchResult,
  RegrindInput,
  RegrindResult,
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
    if (!ing.calculatedByDifference && ing.percentOfBlend == null) {
      throw new Error(
        `Ingredient "${ing.name}" has no percentOfBlend and is not the calculated-by-difference ingredient.`
      );
    }
  }
}

/**
 * Fresh batch calculation. Generalized port of the prototype's calc() for
 * mode === 'fresh'. Numerically identical to the original for the default
 * 4-ingredient formulation — see tests/calcEngine.test.ts.
 */
export function calculateFreshBatch(input: FreshBatchInput): FreshBatchResult | null {
  const { tabletCount, targetWeightG, targetActiveMgPerTablet, ingredients } = input;
  validateIngredients(ingredients);

  const active = ingredients.find((i) => i.role === 'active')!;
  const filler = ingredients.find((i) => i.calculatedByDifference)!;
  const activePercent = active.percentOfBlend ?? 0;

  if (activePercent <= 0 || targetActiveMgPerTablet <= 0 || targetWeightG <= 0 || tabletCount <= 0) {
    return null;
  }

  const fixedPercentSum = ingredients
    .filter((i) => !i.calculatedByDifference)
    .reduce((sum, i) => sum + (i.percentOfBlend ?? 0), 0);
  const fillerPercent = Math.max(0, 100 - fixedPercentSum);

  const totalBlendG = tabletCount * targetWeightG;

  const ingredientPercents: Record<string, number> = {};
  const ingredientGrams: Record<string, number> = {};
  for (const ing of ingredients) {
    const pct = ing.calculatedByDifference ? fillerPercent : ing.percentOfBlend ?? 0;
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

/**
 * Regrind calculation. Generalized port of the prototype's calc() for
 * mode === 'regrind', covering both potency-input methods (bulk % / mg-per-tablet).
 */
export function calculateRegrind(input: RegrindInput): RegrindResult | null {
  const {
    potency,
    regroundPowderG,
    targetActiveMgPerTablet,
    targetWeightG,
    fillerIngredientName,
    alreadyPresentIngredientNames,
  } = input;

  let effectivePotency = 0;
  if (potency.method === 'bulkPercent') {
    effectivePotency = potency.percent / 100;
  } else {
    if (potency.mgPerOldTablet > 0 && potency.oldTabletWeightG > 0) {
      effectivePotency = potency.mgPerOldTablet / (potency.oldTabletWeightG * 1000);
    }
  }

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
  const activeInOldPowderG = regroundPowderG * effectivePotency;
  const freshActiveG = Math.max(
    0,
    (tabletCount * targetActiveMgPerTablet) / 1000 - activeInOldPowderG
  );
  const totalBlendG = regroundPowderG + freshActiveG + fillerAddG;
  const actualMgPerTablet =
    tabletCount > 0 ? ((activeInOldPowderG + freshActiveG) * 1000) / tabletCount : 0;

  return {
    mode: 'regrind',
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
