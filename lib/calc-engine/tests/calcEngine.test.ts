import { describe, it, expect } from 'vitest';
import { calculateFreshBatch, calculateRegrind, solveRegrindLotWeight, generateVarianceTable } from '../calcEngine';
import { defaultIngredients } from '../defaultFormulation';
import type { IngredientLine, PotencyInput, RegrindLot, FreshApiEntry, FreshApiPotency } from '../types';

/** A single-lot array whose weight matches regroundPowderG — reduces exactly to the pre-multi-lot formula. */
function singleLot(potency: PotencyInput, weightG: number): RegrindLot[] {
  return [
    {
      id: 'lot1',
      label: 'Lot 1',
      potency,
      weightG,
      disintegrantPercent: null,
      lubricantPercent: null,
      fillerType: '',
      availableStockG: null,
      sourceType: 'regroundTablets',
      isStart: false,
      note: '',
    },
  ];
}

// Fresh-batch tests below are verified against real production data
// (RR77-PB9), not the original prototype's output — the prototype had a
// confirmed bug where the "potency" input was treated as the active
// ingredient's direct % of blend, rather than the raw material's purity.
// The corrected formula (matching how regrind mode already worked):
//   raw material mg needed per tablet = targetActiveMgPerTablet / potency
//   active % of blend = that mg amount / (targetWeightG * 1000) * 100
// The old golden-value tests (byte-parity against the buggy prototype) have
// been removed; regrind and variance-table tests, which were never affected
// by this bug, are unchanged below.

/** ingredients no longer carry the active-role entry — actives are supplied via apis[] instead. */
function nonActiveIngredients(): IngredientLine[] {
  return defaultIngredients().filter((i) => i.role !== 'active');
}

/** A single-API array — reduces exactly to the pre-combo-product single-active formula. */
function singleApi(potency: FreshApiPotency, targetActiveMgPerTablet: number): FreshApiEntry[] {
  return [{ id: 'active', label: 'API', targetActiveMgPerTablet, potency }];
}

describe('calculateFreshBatch — RR77-PB9 (real production data, single API)', () => {
  const result = calculateFreshBatch({
    tabletCount: 10887,
    targetWeightG: 0.69,
    apis: singleApi({ method: 'bulkPercent', percent: 76.4 }, 60),
    ingredients: nonActiveIngredients(),
    fillerType: 'Emdex',
  });

  it('matches verified totalBlendG (7,512.03 g)', () => {
    expect(result!.totalBlendG).toBeCloseTo(7512.03, 6);
  });

  it('matches verified active % of blend (≈ 11.3817%)', () => {
    expect(result!.activePercentOfBlend).toBeCloseTo(11.3817, 4);
  });

  it('matches verified active grams (≈ 855.00 g)', () => {
    expect(result!.ingredientGrams['active']).toBeCloseTo(855.0, 2);
  });

  it('active mg/tablet backs out to the target (60 mg) at the stated potency', () => {
    const rawMaterialMgPerTablet = (result!.ingredientGrams['active'] * 1000) / result!.tabletCount;
    const pureActiveMgPerTablet = rawMaterialMgPerTablet * 0.764;
    expect(pureActiveMgPerTablet).toBeCloseTo(60, 1);
  });

  it('all ingredient percents sum to 100%', () => {
    const sum = Object.values(result!.ingredientPercents).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it('all ingredient grams sum to totalBlendG', () => {
    const sum = Object.values(result!.ingredientGrams).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(result!.totalBlendG, 6);
  });

  it('exposes the single API in result.apis with matching grams/percent', () => {
    expect(result!.apis).toHaveLength(1);
    expect(result!.apis[0].id).toBe('active');
    expect(result!.apis[0].gramsPerRun).toBeCloseTo(855.0, 2);
    expect(result!.apis[0].percentOfBlend).toBeCloseTo(11.3817, 4);
  });
});

describe('calculateFreshBatch — potency guards', () => {
  it('returns null when the API potency is 0', () => {
    const result = calculateFreshBatch({
      tabletCount: 10887,
      targetWeightG: 0.69,
      apis: singleApi({ method: 'bulkPercent', percent: 0 }, 60),
      ingredients: nonActiveIngredients(),
      fillerType: 'Emdex',
    });
    expect(result).toBeNull();
  });

  it('a 100%-pure raw material yields active % of blend equal to targetActiveMgPerTablet as a fraction of tablet weight', () => {
    const result = calculateFreshBatch({
      tabletCount: 1000,
      targetWeightG: 1.0,
      apis: singleApi({ method: 'bulkPercent', percent: 100 }, 50),
      ingredients: nonActiveIngredients(),
      fillerType: 'Emdex',
    });
    // 50mg of a 100%-pure material in a 1000mg (1.0g) tablet = 5% of blend.
    expect(result!.activePercentOfBlend).toBeCloseTo(5, 6);
  });

  it('returns null when apis is empty', () => {
    const result = calculateFreshBatch({
      tabletCount: 1000,
      targetWeightG: 1.0,
      apis: [],
      ingredients: nonActiveIngredients(),
      fillerType: 'Emdex',
    });
    expect(result).toBeNull();
  });
});

describe('calculateFreshBatch — generic ingredient count', () => {
  it('EZTAB is a permanent 5th ingredient in the default formulation, handled with no engine changes', () => {
    const ids = defaultIngredients().map((i) => i.id);
    expect(ids).toContain('eztab');

    const result = calculateFreshBatch({
      tabletCount: 10887,
      targetWeightG: 0.69,
      apis: singleApi({ method: 'bulkPercent', percent: 76.4 }, 60),
      ingredients: nonActiveIngredients(),
      fillerType: 'Emdex',
    });
    expect(result).not.toBeNull();
    expect(result!.ingredientPercents['eztab']).toBeCloseTo(10, 6);
    expect(result!.ingredientGrams['eztab']).toBeCloseTo(751.203, 2);
    const sum = Object.values(result!.ingredientPercents).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it('supports an arbitrary 6th ingredient beyond the shipped defaults, with no engine changes', () => {
    const ingredients: IngredientLine[] = [
      ...nonActiveIngredients(),
      { id: 'flowaid', name: 'FlowAid', role: 'other', percentOfBlend: 3, calculatedByDifference: false },
    ];
    const result = calculateFreshBatch({
      tabletCount: 10887,
      targetWeightG: 0.69,
      apis: singleApi({ method: 'bulkPercent', percent: 76.4 }, 60),
      ingredients,
      fillerType: 'Emdex',
    });
    expect(result).not.toBeNull();
    expect(result!.ingredientPercents['flowaid']).toBeCloseTo(3, 6);
    expect(result!.ingredientGrams['flowaid']).toBeCloseTo(7512.03 * 0.03, 2);
    const sum = Object.values(result!.ingredientPercents).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 6);
  });
});

describe('calculateFreshBatch — multiple APIs (combo product)', () => {
  // Clean round numbers: 1000 tablets @ 1.0g each = 1000g total blend.
  // API 1: 50mg target @ 100% potency -> 50mg raw material/tablet -> 5% of blend.
  // API 2: 30mg target @ 60% potency (expressed as mg-per-unit) -> 50mg raw material/tablet -> 5% of blend.
  const apis: FreshApiEntry[] = [
    { id: 'api1', label: 'Ingredient A', targetActiveMgPerTablet: 50, potency: { method: 'bulkPercent', percent: 100 } },
    {
      id: 'api2',
      label: 'Ingredient B',
      targetActiveMgPerTablet: 30,
      potency: { method: 'mgPerUnit', mgPerUnit: 600, unitWeightG: 1 }, // 600mg/g = 60% fraction
    },
  ];
  const ingredients: IngredientLine[] = [
    { id: 'filler', name: 'Emdex', role: 'diluent', percentOfBlend: null, calculatedByDifference: true },
  ];

  it('combined active mass per tablet is the sum of each API target mg/tablet', () => {
    const result = calculateFreshBatch({
      tabletCount: 1000,
      targetWeightG: 1.0,
      apis,
      ingredients,
      fillerType: 'Emdex',
    });
    expect(result!.targetActiveMgPerTablet).toBeCloseTo(80, 6);
  });

  it("each API's own raw-material % of blend is computed independently, then summed for activePercentOfBlend", () => {
    const result = calculateFreshBatch({
      tabletCount: 1000,
      targetWeightG: 1.0,
      apis,
      ingredients,
      fillerType: 'Emdex',
    });
    expect(result!.apis).toHaveLength(2);
    expect(result!.apis[0].percentOfBlend).toBeCloseTo(5, 6);
    expect(result!.apis[1].percentOfBlend).toBeCloseTo(5, 6);
    expect(result!.activePercentOfBlend).toBeCloseTo(10, 6);
  });

  it('filler math subtracts the combined active total (and any other excipients) from target tablet weight', () => {
    const result = calculateFreshBatch({
      tabletCount: 1000,
      targetWeightG: 1.0,
      apis,
      ingredients,
      fillerType: 'Emdex',
    });
    // totalBlendG = 1000 * 1.0 = 1000g; APIs take 5% + 5% = 10%, filler gets the remaining 90%.
    expect(result!.totalBlendG).toBeCloseTo(1000, 6);
    expect(result!.ingredientGrams['api1']).toBeCloseTo(50, 6);
    expect(result!.ingredientGrams['api2']).toBeCloseTo(50, 6);
    expect(result!.ingredientGrams['filler']).toBeCloseTo(900, 6);
    const sum = Object.values(result!.ingredientGrams).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(result!.totalBlendG, 6);
  });

  it('returns null if any single API is missing potency or target dose, even if others are valid', () => {
    const incomplete: FreshApiEntry[] = [
      apis[0],
      { id: 'api2', label: 'Ingredient B', targetActiveMgPerTablet: 30, potency: { method: 'bulkPercent', percent: 0 } },
    ];
    const result = calculateFreshBatch({
      tabletCount: 1000,
      targetWeightG: 1.0,
      apis: incomplete,
      ingredients,
      fillerType: 'Emdex',
    });
    expect(result).toBeNull();
  });
});

// Single-lot regrind runs (lot weight === regroundPowderG) must reduce to
// exactly the pre-multi-lot formula — these are the same golden fixtures
// used before lots existed, now expressed as a one-element lots array, per
// the "single-lot regrind behavior stays identical to today" constraint.
// Golden fillerAddG figures below were updated for the always-on 1%
// lubricant top-up (see REGRIND_LUBRICANT_TOPUP_PERCENT): each is the
// pre-top-up golden figure minus tabletCount * targetWeightG * 0.01.
// totalBlendG is deliberately unaffected — the top-up is redistributed out
// of filler, not added on top, so mass is conserved.
describe('calculateRegrind (bulkPercent, single lot) — preset2_regrindOptA', () => {
  const result = calculateRegrind({
    lots: singleLot({ method: 'bulkPercent', percent: 55.5 }, 8000),
    regroundPowderG: 8000,
    targetActiveMgPerTablet: 60,
    targetWeightG: 1.15,
    fillerIngredientName: 'Emdex',
    alreadyPresentIngredientNames: ['PVPP XL'],
    lubricantTopUpIngredientName: 'Magnesium stearate',
  });

  it('matches golden tabletCount (74000)', () => {
    expect(result!.tabletCount).toBe(74000);
  });

  it('matches golden totalBlendG (85100) — unaffected by the top-up, since it is redistributed out of filler', () => {
    expect(result!.totalBlendG).toBeCloseTo(85100, 6);
  });

  it('matches fillerAddG net of the 1% lubricant top-up (77100 - 851 = 76249)', () => {
    expect(result!.fillerAddG).toBeCloseTo(76249, 6);
  });

  it('matches golden activeInOldPowderG (4440)', () => {
    expect(result!.activeInOldPowderG).toBeCloseTo(4440, 6);
  });

  it('matches golden actualMgPerTablet (60)', () => {
    expect(result!.actualMgPerTablet).toBeCloseTo(60, 6);
  });

  it('matches golden freshActiveG (0 — old powder covers full batch)', () => {
    expect(result!.freshActiveG).toBe(0);
  });

  it('has no powder-weight mismatch and no starts lot', () => {
    expect(result!.regroundPowderMismatch).toBe(false);
    expect(result!.hasStartsLot).toBe(false);
    expect(result!.lotWeightSum).toBeCloseTo(8000, 6);
  });

  it('lubricant top-up is 1% of final blend weight (74000 tablets * 1.15g * 0.01 = 851g)', () => {
    expect(result!.lubricantTopUpG).toBeCloseTo(851, 6);
    expect(result!.lubricantTopUpIngredientName).toBe('Magnesium stearate');
  });

  it('fillerAddG + lubricantTopUpG + regroundPowderG + freshActiveG sum to totalBlendG', () => {
    expect(result!.fillerAddG + result!.lubricantTopUpG + result!.regroundPowderG + result!.freshActiveG).toBeCloseTo(
      result!.totalBlendG,
      6
    );
  });
});

describe('calculateRegrind (mgPerTablet, single lot) — preset0_regrindOptB', () => {
  const result = calculateRegrind({
    lots: singleLot({ method: 'mgPerTablet', mgPerOldTablet: 20.1, oldTabletWeightG: 0.27 }, 14500),
    regroundPowderG: 14500,
    targetActiveMgPerTablet: 35,
    targetWeightG: 0.8,
    fillerIngredientName: 'Emdex',
    alreadyPresentIngredientNames: ['PVPP XL'],
    lubricantTopUpIngredientName: 'Magnesium stearate',
  });

  it('matches golden effectivePotency', () => {
    expect(result!.effectivePotency).toBeCloseTo(0.07444444444444445, 10);
  });

  it('matches golden tabletCount (30841)', () => {
    expect(result!.tabletCount).toBe(30841);
  });

  it('matches golden totalBlendG — unaffected by the top-up, since it is redistributed out of filler', () => {
    expect(result!.totalBlendG).toBeCloseTo(24672.926865671645, 6);
  });

  it('matches fillerAddG net of the 1% lubricant top-up', () => {
    expect(result!.fillerAddG).toBeCloseTo(9926.198865671646, 6);
  });

  it('matches golden activeInOldPowderG', () => {
    expect(result!.activeInOldPowderG).toBeCloseTo(1079.4444444444446, 6);
  });

  it('matches golden actualMgPerTablet', () => {
    expect(result!.actualMgPerTablet).toBeCloseTo(35.00030623016259, 6);
  });

  it('lubricant top-up is 1% of final blend weight (30841 tablets * 0.8g * 0.01)', () => {
    expect(result!.lubricantTopUpG).toBeCloseTo(246.728, 3);
  });
});

describe('calculateRegrind — multi-lot blending', () => {
  const lots: RegrindLot[] = [
    {
      id: 'lot1',
      label: '77 starts',
      potency: { method: 'bulkPercent', percent: 55.5 },
      weightG: 8000,
      disintegrantPercent: 4.5,
      lubricantPercent: 1.8,
      fillerType: 'EasyTab',
      availableStockG: null,
      sourceType: 'regroundTablets',
      isStart: true,
      note: 'press starts, weight estimated',
    },
    {
      id: 'lot2',
      label: '21 powder',
      potency: { method: 'mgPerTablet', mgPerOldTablet: 20.1, oldTabletWeightG: 0.27 },
      weightG: 6500,
      disintegrantPercent: null,
      lubricantPercent: null,
      fillerType: '',
      availableStockG: null,
      sourceType: 'regroundTablets',
      isStart: false,
      note: '',
    },
  ];

  it('blends activeInOldPowderG as the sum of each lot weight * lot potency', () => {
    const result = calculateRegrind({
      lots,
      regroundPowderG: 14500,
      targetActiveMgPerTablet: 40,
      targetWeightG: 0.9,
      fillerIngredientName: 'Emdex',
      alreadyPresentIngredientNames: ['PVPP XL'],
      lubricantTopUpIngredientName: 'Magnesium stearate',
    });
    const lot1Active = 8000 * 0.555;
    const lot2Active = 6500 * (20.1 / (0.27 * 1000));
    expect(result!.activeInOldPowderG).toBeCloseTo(lot1Active + lot2Active, 6);
    expect(result!.lots).toHaveLength(2);
    expect(result!.lots[0].activeContentG).toBeCloseTo(lot1Active, 6);
    expect(result!.lots[1].activeContentG).toBeCloseTo(lot2Active, 6);
  });

  it('carries fillerType through per lot without affecting the math', () => {
    const result = calculateRegrind({
      lots,
      regroundPowderG: 14500,
      targetActiveMgPerTablet: 40,
      targetWeightG: 0.9,
      fillerIngredientName: 'Emdex',
      alreadyPresentIngredientNames: [],
      lubricantTopUpIngredientName: 'Magnesium stearate',
    });
    expect(result!.lots[0].fillerType).toBe('EasyTab');
    expect(result!.lots[1].fillerType).toBe('');
  });

  it('flags hasStartsLot when any lot is marked as starts, without excluding it from the total', () => {
    const result = calculateRegrind({
      lots,
      regroundPowderG: 14500,
      targetActiveMgPerTablet: 40,
      targetWeightG: 0.9,
      fillerIngredientName: 'Emdex',
      alreadyPresentIngredientNames: [],
      lubricantTopUpIngredientName: 'Magnesium stearate',
    });
    expect(result!.hasStartsLot).toBe(true);
    expect(result!.lots[0].isStart).toBe(true);
    // The starts lot's active content is still included in the blended total.
    expect(result!.activeInOldPowderG).toBeGreaterThan(result!.lots[1].activeContentG);
  });

  it('flags regroundPowderMismatch when the entered total disagrees with the lot-weight sum', () => {
    const mismatched = calculateRegrind({
      lots,
      regroundPowderG: 14000, // lots sum to 14500
      targetActiveMgPerTablet: 40,
      targetWeightG: 0.9,
      fillerIngredientName: 'Emdex',
      alreadyPresentIngredientNames: [],
      lubricantTopUpIngredientName: 'Magnesium stearate',
    });
    expect(mismatched!.lotWeightSum).toBeCloseTo(14500, 6);
    expect(mismatched!.regroundPowderMismatch).toBe(true);

    const matched = calculateRegrind({
      lots,
      regroundPowderG: 14500,
      targetActiveMgPerTablet: 40,
      targetWeightG: 0.9,
      fillerIngredientName: 'Emdex',
      alreadyPresentIngredientNames: [],
      lubricantTopUpIngredientName: 'Magnesium stearate',
    });
    expect(matched!.regroundPowderMismatch).toBe(false);
  });

  it('the entered regroundPowderG (not the lot-weight sum) drives the downstream math', () => {
    // Deliberately mismatched: the manual entry stays authoritative even
    // though it disagrees with the lot sum — only a warning is raised.
    const result = calculateRegrind({
      lots,
      regroundPowderG: 14000,
      targetActiveMgPerTablet: 40,
      targetWeightG: 0.9,
      fillerIngredientName: 'Emdex',
      alreadyPresentIngredientNames: [],
      lubricantTopUpIngredientName: 'Magnesium stearate',
    });
    const activeInOldPowderG = 8000 * 0.555 + 6500 * (20.1 / (0.27 * 1000));
    expect(result!.effectivePotency).toBeCloseTo(activeInOldPowderG / 14000, 10);
  });
});

// Clean, hand-verifiable example for the always-on 1% lubricant top-up:
// 1000g reground powder @ 50% potency, target 25mg/tablet @ 0.5g/tablet.
//   tabletCount = floor(1000 * 0.5 * 1000 / 25) = 20000
//   regrindPerTabletG = 25 / (0.5 * 1000) = 0.05g
//   lubricantTopUpPerTabletG = 0.5 * 0.01 * 1.0 (100% reground-tablet lots) = 0.005g -> lubricantTopUpG = 20000 * 0.005 = 100g
//   fillerPerTabletG = 0.5 - 0.05 - 0.005 = 0.445g -> fillerAddG = 20000 * 0.445 = 8900g
//   activeInOldPowderG = 1000 * 0.5 = 500g = 20000 * 25mg/1000, so freshActiveG = 0
//   totalBlendG = 1000 + 0 + 8900 + 100 = 10000g (unchanged by the top-up — redistributed, not added)
// This lot uses the default sourceType 'regroundTablets' (via singleLot), so
// this is also the regression proof that a 100%-reground-tablets batch is
// byte-identical to the top-up math as shipped before source-type restriction.
describe('calculateRegrind — 1% lubricant top-up (100% reground-tablet lots)', () => {
  const result = calculateRegrind({
    lots: singleLot({ method: 'bulkPercent', percent: 50 }, 1000),
    regroundPowderG: 1000,
    targetActiveMgPerTablet: 25,
    targetWeightG: 0.5,
    fillerIngredientName: 'Emdex',
    alreadyPresentIngredientNames: ['PVPP XL'],
    lubricantTopUpIngredientName: 'Magnesium stearate',
  });

  it('adds a lubricant top-up equal to exactly 1% of the final blend weight', () => {
    expect(result!.lubricantTopUpG).toBeCloseTo(100, 6);
    expect(result!.lubricantTopUpIngredientName).toBe('Magnesium stearate');
  });

  it('carves the top-up out of filler rather than adding it on top', () => {
    expect(result!.fillerAddG).toBeCloseTo(8900, 6);
    expect(result!.totalBlendG).toBeCloseTo(10000, 6);
  });

  it('does not include the lubricant in alreadyPresentIngredientNames — it now gets its own always-on top-up instead', () => {
    expect(result!.alreadyPresentIngredientNames).not.toContain('Magnesium stearate');
  });

  it('applies the top-up even when the regrind powder alone already covers the full active dose', () => {
    expect(result!.freshActiveG).toBe(0);
    expect(result!.lubricantTopUpG).toBeGreaterThan(0);
  });

  it('every lot defaults to sourceType regroundTablets', () => {
    expect(result!.lots[0].sourceType).toBe('regroundTablets');
  });
});

// Same scenario as above, but half the reground weight is raw/bulk powder
// (never pressed) rather than reground tablets. Numbers below all follow
// from scaling the top-up by the reground-tablet share of lot weight:
//   lot1 (regroundTablets) = 600g @ 50%, lot2 (rawPowder) = 400g @ 50%
//   activeInOldPowderG = 1000 * 0.5 = 500g (potency blending is unaffected by sourceType)
//   regroundTabletFraction = 600 / 1000 = 0.6
//   lubricantTopUpPerTabletG = 0.5 * 0.01 * 0.6 = 0.003g -> lubricantTopUpG = 20000 * 0.003 = 60g
//   fillerPerTabletG = 0.5 - 0.05 - 0.003 = 0.447g -> fillerAddG = 20000 * 0.447 = 8940g
//   totalBlendG unchanged at 10000g (still redistributed, not added)
describe('calculateRegrind — 1% lubricant top-up (mixed reground/raw-powder lots)', () => {
  const lots: RegrindLot[] = [
    {
      id: 'lot1',
      label: 'Reground lot',
      potency: { method: 'bulkPercent', percent: 50 },
      weightG: 600,
      disintegrantPercent: null,
      lubricantPercent: null,
      fillerType: '',
      availableStockG: null,
      sourceType: 'regroundTablets',
      isStart: false,
      note: '',
    },
    {
      id: 'lot2',
      label: 'Raw powder lot',
      potency: { method: 'bulkPercent', percent: 50 },
      weightG: 400,
      disintegrantPercent: null,
      lubricantPercent: null,
      fillerType: '',
      availableStockG: null,
      sourceType: 'rawPowder',
      isStart: false,
      note: '',
    },
  ];
  const result = calculateRegrind({
    lots,
    regroundPowderG: 1000,
    targetActiveMgPerTablet: 25,
    targetWeightG: 0.5,
    fillerIngredientName: 'Emdex',
    alreadyPresentIngredientNames: ['PVPP XL'],
    lubricantTopUpIngredientName: 'Magnesium stearate',
  });

  it('scales the top-up down to the reground-tablet share of lot weight (60% -> 60g instead of 100g)', () => {
    expect(result!.lubricantTopUpG).toBeCloseTo(60, 6);
  });

  it('the excluded raw-powder lot weight goes to filler instead, keeping totalBlendG unchanged', () => {
    expect(result!.fillerAddG).toBeCloseTo(8940, 6);
    expect(result!.totalBlendG).toBeCloseTo(10000, 6);
  });

  it("raw-powder lot's own potency/activeContentG is unaffected — only the top-up basis changes", () => {
    expect(result!.activeInOldPowderG).toBeCloseTo(500, 6);
    expect(result!.lots[1].activeContentG).toBeCloseTo(200, 6); // 400g * 50%
  });

  it('carries each lot\'s sourceType through to the result', () => {
    expect(result!.lots[0].sourceType).toBe('regroundTablets');
    expect(result!.lots[1].sourceType).toBe('rawPowder');
  });
});

describe('calculateRegrind — 1% lubricant top-up (100% raw-powder lots)', () => {
  it('produces zero top-up when no lot is marked regroundTablets — everything goes to filler', () => {
    const result = calculateRegrind({
      lots: [
        {
          id: 'lot1',
          label: 'All raw powder',
          potency: { method: 'bulkPercent', percent: 50 },
          weightG: 1000,
          disintegrantPercent: null,
          lubricantPercent: null,
          fillerType: '',
          availableStockG: null,
          sourceType: 'rawPowder',
          isStart: false,
          note: '',
        },
      ],
      regroundPowderG: 1000,
      targetActiveMgPerTablet: 25,
      targetWeightG: 0.5,
      fillerIngredientName: 'Emdex',
      alreadyPresentIngredientNames: ['PVPP XL'],
      lubricantTopUpIngredientName: 'Magnesium stearate',
    });
    expect(result!.lubricantTopUpG).toBe(0);
    // fillerAddG absorbs the full 100g that would otherwise have gone to the top-up.
    expect(result!.fillerAddG).toBeCloseTo(9000, 6);
    expect(result!.totalBlendG).toBeCloseTo(10000, 6);
  });
});

describe('solveRegrindLotWeight — lubricant top-up feasibility', () => {
  it('rejects a target that only calculateRegrind\'s post-top-up filler would have caught, proving the two stay consistent', () => {
    // Rigged so fillerAddG would be tiny and positive WITHOUT the top-up,
    // but negative once the 1% lubricant top-up is accounted for.
    const result = solveRegrindLotWeight({
      fixedLots: [],
      solvingLotPotency: { method: 'bulkPercent', percent: 100 },
      solvingLotSourceType: 'regroundTablets',
      targetTabletCount: 1000,
      targetActiveMgPerTablet: 995,
      targetWeightG: 1.0,
    });
    // totalBlendG=1000, solvedWeightG=995 (100% potency), pre-top-up filler = 5g,
    // but the 1% top-up needs 10g -> infeasible.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/isn't achievable/i);
      expect(result.reason).toMatch(/lubricant top-up/i);
    }
  });

  it('a raw-powder solving lot with no fixed lots gets zero top-up, so the same target that was infeasible above becomes feasible', () => {
    const result = solveRegrindLotWeight({
      fixedLots: [],
      solvingLotPotency: { method: 'bulkPercent', percent: 100 },
      solvingLotSourceType: 'rawPowder',
      targetTabletCount: 1000,
      targetActiveMgPerTablet: 995,
      targetWeightG: 1.0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fillerAddG).toBeCloseTo(5, 6);
    }
  });
});

// Known-correct example (see conversation): Lot 1 fixed at 11,346.14g,
// 14mg/730mg potency; Lot 2 solved, 40mg/690mg potency; target 100,000
// tablets, 14mg/tablet, 0.8g/tablet. Solving precisely gives Lot 2 =
// 20,396.45g (rounds to 20,396.4 or 20,396.5 depending on rounding
// convention — the two provided reference numbers, 20,396.5g for the lot
// and 48,257.4g for filler, are not simultaneously exact to 1 decimal from
// the same precise total-blend/lot-1-weight inputs; filler matches exactly,
// the lot figure is off by 0.05g, consistent with a rounding artifact in
// how that number was manually derived rather than a formula error).
// solvedWeightG is unaffected by the later-added 1% lubricant top-up (it
// only depends on active mass, not filler), so it's still checked against
// the original reference value. The filler figure below is that same
// original reference (48,257.4g) minus the top-up (800g = 1% of the 80,000g
// total blend), since the top-up is now carved out of filler.
describe('solveRegrindLotWeight — known-correct example', () => {
  const fixedLots: { weightG: number; potency: PotencyInput; sourceType: 'regroundTablets' }[] = [
    { weightG: 11346.14, potency: { method: 'bulkPercent', percent: (14 / 730) * 100 }, sourceType: 'regroundTablets' },
  ];
  const solvingLotPotency = { method: 'bulkPercent' as const, percent: (40 / 690) * 100 };

  it('solves Lot 2 weight to match the precise value derived from the given formulas', () => {
    const result = solveRegrindLotWeight({
      fixedLots,
      solvingLotPotency,
      solvingLotSourceType: 'regroundTablets',
      targetTabletCount: 100000,
      targetActiveMgPerTablet: 14,
      targetWeightG: 0.8,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.solvedWeightG).toBeCloseTo(20396.45, 1);
      expect(result.totalBlendG).toBeCloseTo(80000, 6);
    }
  });

  it('matches the provided filler figure net of the 1% lubricant top-up (48,257.4 - 800 = 47,457.4 g)', () => {
    const result = solveRegrindLotWeight({
      fixedLots,
      solvingLotPotency,
      solvingLotSourceType: 'regroundTablets',
      targetTabletCount: 100000,
      targetActiveMgPerTablet: 14,
      targetWeightG: 0.8,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fillerAddG).toBeCloseTo(47457.4, 1);
    }
  });

  it('feeding the solved weight into calculateRegrind reproduces the same filler and total blend', () => {
    const solve = solveRegrindLotWeight({
      fixedLots,
      solvingLotPotency,
      solvingLotSourceType: 'regroundTablets',
      targetTabletCount: 100000,
      targetActiveMgPerTablet: 14,
      targetWeightG: 0.8,
    });
    expect(solve.ok).toBe(true);
    if (!solve.ok) return;

    const lots: RegrindLot[] = [
      {
        id: 'lot1',
        label: 'Lot 1',
        potency: fixedLots[0].potency,
        weightG: fixedLots[0].weightG,
        disintegrantPercent: null,
        lubricantPercent: null,
        fillerType: '',
        availableStockG: null,
        sourceType: 'regroundTablets',
        isStart: false,
        note: '',
      },
      {
        id: 'lot2',
        label: 'Lot 2',
        potency: solvingLotPotency,
        weightG: solve.solvedWeightG,
        disintegrantPercent: null,
        lubricantPercent: null,
        fillerType: '',
        availableStockG: null,
        sourceType: 'regroundTablets',
        isStart: false,
        note: '',
      },
    ];
    const regroundPowderG = lots.reduce((sum, l) => sum + l.weightG, 0);
    const result = calculateRegrind({
      lots,
      regroundPowderG,
      targetActiveMgPerTablet: 14,
      targetWeightG: 0.8,
      fillerIngredientName: 'Emdex',
      alreadyPresentIngredientNames: [],
      lubricantTopUpIngredientName: 'Magnesium stearate',
    });
    expect(result).not.toBeNull();
    expect(result!.tabletCount).toBe(100000);
    expect(result!.fillerAddG).toBeCloseTo(solve.fillerAddG, 6);
    expect(result!.totalBlendG).toBeCloseTo(solve.totalBlendG, 6);
    expect(result!.regroundPowderMismatch).toBe(false);
  });
});

describe('solveRegrindLotWeight — infeasibility guards', () => {
  it('returns ok:false when fixed lots alone already meet or exceed the target active mass', () => {
    const result = solveRegrindLotWeight({
      fixedLots: [{ weightG: 100000, potency: { method: 'bulkPercent', percent: 100 }, sourceType: 'regroundTablets' }],
      solvingLotPotency: { method: 'bulkPercent', percent: 50 },
      solvingLotSourceType: 'regroundTablets',
      targetTabletCount: 100000,
      targetActiveMgPerTablet: 14,
      targetWeightG: 0.8,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/nothing left/i);
    }
  });

  it('returns ok:false when the solved lot plus fixed lots would exceed the total blend mass', () => {
    const result = solveRegrindLotWeight({
      fixedLots: [{ weightG: 79999, potency: { method: 'bulkPercent', percent: 0.001 }, sourceType: 'regroundTablets' }],
      solvingLotPotency: { method: 'bulkPercent', percent: 0.001 },
      solvingLotSourceType: 'regroundTablets',
      targetTabletCount: 100000,
      targetActiveMgPerTablet: 14,
      targetWeightG: 0.8,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/isn't achievable/i);
    }
  });

  it('returns ok:false for a zero target tablet count', () => {
    const result = solveRegrindLotWeight({
      fixedLots: [],
      solvingLotPotency: { method: 'bulkPercent', percent: 50 },
      solvingLotSourceType: 'regroundTablets',
      targetTabletCount: 0,
      targetActiveMgPerTablet: 14,
      targetWeightG: 0.8,
    });
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when the solving lot has no valid potency', () => {
    const result = solveRegrindLotWeight({
      fixedLots: [],
      solvingLotPotency: { method: 'bulkPercent', percent: 0 },
      solvingLotSourceType: 'regroundTablets',
      targetTabletCount: 1000,
      targetActiveMgPerTablet: 14,
      targetWeightG: 0.8,
    });
    expect(result.ok).toBe(false);
  });

  it('handles zero fixed lots — the solving lot alone must supply the full target', () => {
    const result = solveRegrindLotWeight({
      fixedLots: [],
      solvingLotPotency: { method: 'bulkPercent', percent: 50 },
      solvingLotSourceType: 'regroundTablets',
      targetTabletCount: 1000,
      targetActiveMgPerTablet: 10,
      targetWeightG: 1.0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 1000 tablets * 10mg / 1000 = 10g active needed, at 50% potency -> 20g.
      // fillerAddG = 1000 - 20 - (1000 * 0.01 lubricant top-up) = 970.
      expect(result.solvedWeightG).toBeCloseTo(20, 6);
      expect(result.totalBlendG).toBeCloseTo(1000, 6);
      expect(result.fillerAddG).toBeCloseTo(970, 6);
    }
  });
});

describe('generateVarianceTable', () => {
  it('matches golden 7-row table for the fresh preset (target 0.69g / 35mg)', () => {
    const rows = generateVarianceTable(0.69, 35);
    expect(rows).toEqual([
      { weightG: 0.675, step: -3, potencyMg: 34.239 },
      { weightG: 0.68, step: -2, potencyMg: 34.493 },
      { weightG: 0.685, step: -1, potencyMg: 34.746 },
      { weightG: 0.69, step: 0, potencyMg: 35 },
      { weightG: 0.695, step: 1, potencyMg: 35.254 },
      { weightG: 0.7, step: 2, potencyMg: 35.507 },
      { weightG: 0.705, step: 3, potencyMg: 35.761 },
    ]);
  });

  it('matches golden 7-row table for the regrind option-A preset (target 1.15g / 60mg)', () => {
    const rows = generateVarianceTable(1.15, 60);
    expect(rows).toEqual([
      { weightG: 1.135, step: -3, potencyMg: 59.217 },
      { weightG: 1.14, step: -2, potencyMg: 59.478 },
      { weightG: 1.145, step: -1, potencyMg: 59.739 },
      { weightG: 1.15, step: 0, potencyMg: 60 },
      { weightG: 1.155, step: 1, potencyMg: 60.261 },
      { weightG: 1.16, step: 2, potencyMg: 60.522 },
      { weightG: 1.165, step: 3, potencyMg: 60.783 },
    ]);
  });
});

describe('validation guards', () => {
  it("throws if ingredients still includes a role:'active' entry — actives now belong in apis[]", () => {
    expect(() =>
      calculateFreshBatch({
        tabletCount: 100,
        targetWeightG: 0.5,
        apis: singleApi({ method: 'bulkPercent', percent: 50 }, 10),
        ingredients: defaultIngredients(), // still contains the active-role entry
        fillerType: 'Emdex',
      })
    ).toThrow(/must not include role 'active'/);
  });

  it('throws if two ingredients are calculatedByDifference', () => {
    const bad = nonActiveIngredients().map((i) => (i.id === 'pvpp' ? { ...i, calculatedByDifference: true } : i));
    expect(() =>
      calculateFreshBatch({
        tabletCount: 100,
        targetWeightG: 0.5,
        apis: singleApi({ method: 'bulkPercent', percent: 50 }, 10),
        ingredients: bad,
        fillerType: 'Emdex',
      })
    ).toThrow(/exactly one ingredient with calculatedByDifference/);
  });

  it('returns null (not throw) for incomplete but validly-shaped input', () => {
    const result = calculateFreshBatch({
      tabletCount: 0,
      targetWeightG: 0.5,
      apis: singleApi({ method: 'bulkPercent', percent: 50 }, 10),
      ingredients: nonActiveIngredients(),
      fillerType: 'Emdex',
    });
    expect(result).toBeNull();
  });
});
