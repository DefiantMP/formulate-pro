import type {
  FreshBatchInput,
  FreshBatchResult,
  FreshApiEntry,
  FreshApiPotency,
  FreshApiResult,
  RegrindInput,
  RegrindResult,
  RegrindLot,
  RegrindLotResult,
  RegrindSolveInput,
  RegrindSolveResult,
  PotencyInput,
  VarianceRow,
  IngredientLine,
} from './types';

/**
 * Validates the ingredient-shape rules the calc engine depends on for the
 * non-API side of a fresh batch (filler + fixed-% excipients). Active
 * ingredients no longer belong in this list at all — they're supplied via
 * FreshBatchInput.apis instead — so a role:'active' entry here is now a
 * caller error rather than the required shape it used to be.
 */
function validateIngredients(ingredients: IngredientLine[]): void {
  const actives = ingredients.filter((i) => i.role === 'active');
  if (actives.length > 0) {
    throw new Error(
      `calculateFreshBatch ingredients must not include role 'active' entries — active ingredients are supplied via apis[] instead, found ${actives.length}.`
    );
  }
  const byDifference = ingredients.filter((i) => i.calculatedByDifference);
  if (byDifference.length !== 1) {
    throw new Error(
      `Expected exactly one ingredient with calculatedByDifference=true, found ${byDifference.length}.`
    );
  }
  for (const ing of ingredients) {
    if (ing.calculatedByDifference) continue;
    if (ing.percentOfBlend == null) {
      throw new Error(
        `Ingredient "${ing.name}" has no percentOfBlend and is not the calculated-by-difference ingredient.`
      );
    }
  }
}

/** Resolves an API's potency input (bulk % or mg-per-unit) to a 0-1 active fraction. */
function freshApiEffectivePotency(potency: FreshApiPotency): number {
  if (potency.method === 'bulkPercent') {
    return potency.percent / 100;
  }
  if (potency.mgPerUnit > 0 && potency.unitWeightG > 0) {
    return potency.mgPerUnit / (potency.unitWeightG * 1000);
  }
  return 0;
}

/**
 * Fresh batch calculation. Generalized port of the prototype's calc() for
 * mode === 'fresh', with two corrections from the original: (1) each API's
 * % of blend is derived from its own raw-material potency, not taken as a
 * direct input — see tests/calcEngine.test.ts; (2) combo products can carry
 * more than one API, each dosed independently — the combined active % of
 * blend is the SUM of each API's own raw-material % of blend, computed with
 * exactly the same per-API formula as the original single-active case. With
 * exactly one API, this reduces to byte-identical output to the pre-combo
 * formula (proven by the RR77-PB9 regression tests).
 */
export function calculateFreshBatch(input: FreshBatchInput): FreshBatchResult | null {
  const { tabletCount, targetWeightG, apis, ingredients, fillerType } = input;
  validateIngredients(ingredients);

  if (apis.length === 0 || targetWeightG <= 0 || tabletCount <= 0) {
    return null;
  }

  type ApiCalc = { api: FreshApiEntry; potencyFraction: number; percentOfBlend: number };
  const apiCalcs: ApiCalc[] = [];
  for (const api of apis) {
    const potencyFraction = freshApiEffectivePotency(api.potency);
    if (potencyFraction <= 0 || api.targetActiveMgPerTablet <= 0) {
      return null;
    }
    // How much of the (impure) raw material is needed per tablet to deliver
    // this API's targetActiveMgPerTablet of actual active ingredient, then
    // expressed as that raw material's % of the finished tablet's weight.
    const rawMaterialMgPerTablet = api.targetActiveMgPerTablet / potencyFraction;
    const percentOfBlend = (rawMaterialMgPerTablet / (targetWeightG * 1000)) * 100;
    apiCalcs.push({ api, potencyFraction, percentOfBlend });
  }

  const combinedActivePercent = apiCalcs.reduce((sum, a) => sum + a.percentOfBlend, 0);
  const combinedTargetActiveMgPerTablet = apis.reduce((sum, a) => sum + a.targetActiveMgPerTablet, 0);

  const fixedPercentSum =
    combinedActivePercent +
    ingredients
      .filter((i) => !i.calculatedByDifference)
      .reduce((sum, i) => sum + (i.percentOfBlend ?? 0), 0);
  const fillerPercent = Math.max(0, 100 - fixedPercentSum);

  const totalBlendG = tabletCount * targetWeightG;

  const ingredientPercents: Record<string, number> = {};
  const ingredientGrams: Record<string, number> = {};

  const apiResults: FreshApiResult[] = apiCalcs.map(({ api, potencyFraction, percentOfBlend }) => {
    const grams = totalBlendG * (percentOfBlend / 100);
    ingredientPercents[api.id] = percentOfBlend;
    ingredientGrams[api.id] = grams;
    return {
      id: api.id,
      label: api.label,
      targetActiveMgPerTablet: api.targetActiveMgPerTablet,
      effectivePotency: potencyFraction,
      percentOfBlend,
      gramsPerRun: grams,
    };
  });

  for (const ing of ingredients) {
    const pct = ing.calculatedByDifference ? fillerPercent : ing.percentOfBlend ?? 0;
    ingredientPercents[ing.id] = pct;
    ingredientGrams[ing.id] = totalBlendG * (pct / 100);
  }

  return {
    mode: 'fresh',
    tabletCount,
    targetWeightG,
    targetActiveMgPerTablet: combinedTargetActiveMgPerTablet,
    totalBlendG,
    apis: apiResults,
    ingredientGrams,
    ingredientPercents,
    activePercentOfBlend: combinedActivePercent,
    fillerType,
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
      fillerType: lot.fillerType,
      availableStockG: lot.availableStockG,
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
 * Solves for the weight of one unknown regrind lot, given a target tablet
 * count, rather than requiring every lot's weight to be known upfront. This
 * is a standalone calculation deliberately kept separate from
 * calculateRegrind — it does not touch that function or its output shape at
 * all, so the ordinary (non-solve) regrind flow is completely unaffected.
 * The caller feeds the resulting solvedWeightG back into an ordinary
 * RegrindLot and calls calculateRegrind as usual (with regroundPowderG set
 * to the sum of every lot's weight, solved lot included) to get the full
 * per-lot breakdown, filler amount, and totals — reusing that already-tested
 * math rather than duplicating it here.
 */
export function solveRegrindLotWeight(input: RegrindSolveInput): RegrindSolveResult {
  const { fixedLots, solvingLotPotency, targetTabletCount, targetActiveMgPerTablet, targetWeightG } =
    input;

  if (targetTabletCount <= 0 || targetActiveMgPerTablet <= 0 || targetWeightG <= 0) {
    return {
      ok: false,
      reason: 'Target tablet count, target mg/tablet, and target tablet weight must all be entered before solving.',
    };
  }

  const solvingPotencyFraction = lotEffectivePotency(solvingLotPotency);
  if (solvingPotencyFraction <= 0) {
    return { ok: false, reason: "The lot being solved for needs a valid potency before it can be solved." };
  }

  const totalBlendG = targetTabletCount * targetWeightG;
  const totalActiveNeededG = (targetTabletCount * targetActiveMgPerTablet) / 1000;

  let fixedLotWeightSumG = 0;
  let fixedActiveG = 0;
  for (const lot of fixedLots) {
    fixedLotWeightSumG += lot.weightG;
    fixedActiveG += lot.weightG * lotEffectivePotency(lot.potency);
  }

  const activeStillNeededG = totalActiveNeededG - fixedActiveG;
  if (activeStillNeededG <= 0) {
    return {
      ok: false,
      reason: `The fixed lots already provide ${fixedActiveG.toFixed(2)} g of active ingredient, which meets or exceeds the ${totalActiveNeededG.toFixed(2)} g needed for ${targetTabletCount.toLocaleString()} tablets — there's nothing left for the solved lot to contribute. Lower a fixed lot's weight or raise the target.`,
    };
  }

  const solvedWeightG = activeStillNeededG / solvingPotencyFraction;
  const fillerAddG = totalBlendG - fixedLotWeightSumG - solvedWeightG;

  if (fillerAddG < 0) {
    return {
      ok: false,
      reason: `Solving for the target requires ${(fixedLotWeightSumG + solvedWeightG).toFixed(2)} g of lots, which exceeds the ${totalBlendG.toFixed(2)} g total blend needed for ${targetTabletCount.toLocaleString()} tablets — the target isn't achievable with these inputs.`,
    };
  }

  return { ok: true, solvedWeightG, fixedLotWeightSumG, totalBlendG, fillerAddG };
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
