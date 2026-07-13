import { describe, it, expect } from 'vitest';
import { calculateFreshBatch, calculateRegrind, generateVarianceTable } from '../calcEngine';
import { defaultIngredients } from '../defaultFormulation';
import type { IngredientLine } from '../types';

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

function ingredientsWithActivePercent(percent: number): IngredientLine[] {
  return defaultIngredients().map((i) => (i.role === 'active' ? { ...i, percentOfBlend: percent } : i));
}

describe('calculateFreshBatch — RR77-PB9 (real production data)', () => {
  const result = calculateFreshBatch({
    tabletCount: 10887,
    targetWeightG: 0.69,
    targetActiveMgPerTablet: 60,
    potencyPercent: 76.4,
    ingredients: defaultIngredients(),
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
});

describe('calculateFreshBatch — potencyPercent guards', () => {
  it('returns null when potencyPercent is 0', () => {
    const result = calculateFreshBatch({
      tabletCount: 10887,
      targetWeightG: 0.69,
      targetActiveMgPerTablet: 60,
      potencyPercent: 0,
      ingredients: defaultIngredients(),
    });
    expect(result).toBeNull();
  });

  it('a 100%-pure raw material yields active % of blend equal to targetActiveMgPerTablet as a fraction of tablet weight', () => {
    const result = calculateFreshBatch({
      tabletCount: 1000,
      targetWeightG: 1.0,
      targetActiveMgPerTablet: 50,
      potencyPercent: 100,
      ingredients: defaultIngredients(),
    });
    // 50mg of a 100%-pure material in a 1000mg (1.0g) tablet = 5% of blend.
    expect(result!.activePercentOfBlend).toBeCloseTo(5, 6);
  });
});

describe('calculateFreshBatch — generic ingredient count', () => {
  it('EZTAB is a permanent 5th ingredient in the default formulation, handled with no engine changes', () => {
    const ids = defaultIngredients().map((i) => i.id);
    expect(ids).toContain('eztab');

    const result = calculateFreshBatch({
      tabletCount: 10887,
      targetWeightG: 0.69,
      targetActiveMgPerTablet: 60,
      potencyPercent: 76.4,
      ingredients: defaultIngredients(),
    });
    expect(result).not.toBeNull();
    expect(result!.ingredientPercents['eztab']).toBeCloseTo(10, 6);
    expect(result!.ingredientGrams['eztab']).toBeCloseTo(751.203, 2);
    const sum = Object.values(result!.ingredientPercents).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it('supports an arbitrary 6th ingredient beyond the shipped defaults, with no engine changes', () => {
    const ingredients: IngredientLine[] = [
      ...defaultIngredients(),
      { id: 'flowaid', name: 'FlowAid', role: 'other', percentOfBlend: 3, calculatedByDifference: false },
    ];
    const result = calculateFreshBatch({
      tabletCount: 10887,
      targetWeightG: 0.69,
      targetActiveMgPerTablet: 60,
      potencyPercent: 76.4,
      ingredients,
    });
    expect(result).not.toBeNull();
    expect(result!.ingredientPercents['flowaid']).toBeCloseTo(3, 6);
    expect(result!.ingredientGrams['flowaid']).toBeCloseTo(7512.03 * 0.03, 2);
    const sum = Object.values(result!.ingredientPercents).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 6);
  });
});

describe('calculateRegrind (bulkPercent) — preset2_regrindOptA', () => {
  const result = calculateRegrind({
    potency: { method: 'bulkPercent', percent: 55.5 },
    regroundPowderG: 8000,
    targetActiveMgPerTablet: 60,
    targetWeightG: 1.15,
    fillerIngredientName: 'Emdex',
    alreadyPresentIngredientNames: ['Magnesium stearate', 'PVPP XL'],
  });

  it('matches golden tabletCount (74000)', () => {
    expect(result!.tabletCount).toBe(74000);
  });

  it('matches golden totalBlendG (85100)', () => {
    expect(result!.totalBlendG).toBeCloseTo(85100, 6);
  });

  it('matches golden fillerAddG (77100)', () => {
    expect(result!.fillerAddG).toBeCloseTo(77100, 6);
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
});

describe('calculateRegrind (mgPerTablet) — preset0_regrindOptB', () => {
  const result = calculateRegrind({
    potency: { method: 'mgPerTablet', mgPerOldTablet: 20.1, oldTabletWeightG: 0.27 },
    regroundPowderG: 14500,
    targetActiveMgPerTablet: 35,
    targetWeightG: 0.8,
    fillerIngredientName: 'Emdex',
    alreadyPresentIngredientNames: ['Magnesium stearate', 'PVPP XL'],
  });

  it('matches golden effectivePotency', () => {
    expect(result!.effectivePotency).toBeCloseTo(0.07444444444444445, 10);
  });

  it('matches golden tabletCount (30841)', () => {
    expect(result!.tabletCount).toBe(30841);
  });

  it('matches golden totalBlendG', () => {
    expect(result!.totalBlendG).toBeCloseTo(24672.926865671645, 6);
  });

  it('matches golden fillerAddG', () => {
    expect(result!.fillerAddG).toBeCloseTo(10172.926865671645, 6);
  });

  it('matches golden activeInOldPowderG', () => {
    expect(result!.activeInOldPowderG).toBeCloseTo(1079.4444444444446, 6);
  });

  it('matches golden actualMgPerTablet', () => {
    expect(result!.actualMgPerTablet).toBeCloseTo(35.00030623016259, 6);
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
  it('throws if no active ingredient', () => {
    const bad = defaultIngredients().map((i) => (i.role === 'active' ? { ...i, role: 'other' as const } : i));
    expect(() =>
      calculateFreshBatch({
        tabletCount: 100,
        targetWeightG: 0.5,
        targetActiveMgPerTablet: 10,
        potencyPercent: 50,
        ingredients: bad,
      })
    ).toThrow(/exactly one ingredient with role 'active'/);
  });

  it('throws if two ingredients are calculatedByDifference', () => {
    const bad = ingredientsWithActivePercent(50).map((i) =>
      i.id === 'pvpp' ? { ...i, calculatedByDifference: true } : i
    );
    expect(() =>
      calculateFreshBatch({
        tabletCount: 100,
        targetWeightG: 0.5,
        targetActiveMgPerTablet: 10,
        potencyPercent: 50,
        ingredients: bad,
      })
    ).toThrow(/exactly one ingredient with calculatedByDifference/);
  });

  it('returns null (not throw) for incomplete but validly-shaped input', () => {
    const result = calculateFreshBatch({
      tabletCount: 0,
      targetWeightG: 0.5,
      targetActiveMgPerTablet: 10,
      potencyPercent: 50,
      ingredients: defaultIngredients(),
    });
    expect(result).toBeNull();
  });
});
