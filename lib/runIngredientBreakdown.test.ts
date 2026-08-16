import { describe, it, expect } from 'vitest';
import { calculateFreshBatch, calculateRegrind, defaultIngredients } from './calc-engine';
import type { IngredientLine, FreshApiEntry, RegrindLot, PotencyInput } from './calc-engine/types';
import { getRunIngredientBreakdown, findRunIngredientWeight } from './runIngredientBreakdown';

function nonActiveIngredients(): IngredientLine[] {
  return defaultIngredients().filter((i) => i.role !== 'active');
}

// Same helper/fixture shape as calcEngine.test.ts's singleLot + the
// "single regrind lot, absolute potency" golden case.
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

describe('getRunIngredientBreakdown — fresh mode', () => {
  // Same RR77-PB9 golden fixture used in calcEngine.test.ts and
  // runFormulationSync.test.ts.
  const result = calculateFreshBatch({
    tabletCount: 10887,
    targetWeightG: 0.69,
    apis: [{ id: 'active', label: 'API', targetActiveMgPerTablet: 60, potency: { method: 'bulkPercent', percent: 76.4 } }],
    ingredients: nonActiveIngredients(),
    fillerType: 'Emdex',
  })!;

  const rows = getRunIngredientBreakdown('fresh', result);

  it('includes one row per API plus every non-active ingredient with a resolved gram figure', () => {
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.grams]));
    expect(byLabel['API']).toBeCloseTo(855.0, 1);
    expect(byLabel['Emdex']).toBeCloseTo(5379.98, 1);
    expect(byLabel['PVPP XL']).toBeCloseTo(375.6, 1);
    expect(byLabel['Magnesium stearate']).toBeCloseTo(150.24, 1);
    expect(byLabel['EZTAB']).toBeCloseTo(751.2, 1);
  });

  it('labels every API row by its own label for a multi-API combo product', () => {
    const apis: FreshApiEntry[] = [
      { id: 'a', label: 'Vitamin D3', targetActiveMgPerTablet: 10, potency: { method: 'bulkPercent', percent: 90 } },
      { id: 'b', label: 'Vitamin K2', targetActiveMgPerTablet: 0.1, potency: { method: 'bulkPercent', percent: 1 } },
    ];
    const comboResult = calculateFreshBatch({
      tabletCount: 5000,
      targetWeightG: 0.5,
      apis,
      ingredients: nonActiveIngredients(),
      fillerType: 'Dipac',
    })!;
    const comboRows = getRunIngredientBreakdown('fresh', comboResult);
    const labels = comboRows.map((r) => r.label);
    expect(labels).toContain('Vitamin D3');
    expect(labels).toContain('Vitamin K2');
  });

  it('returns an empty array when mode and result.mode disagree', () => {
    expect(getRunIngredientBreakdown('regrind', result)).toEqual([]);
  });
});

describe('getRunIngredientBreakdown — regrind mode', () => {
  const result = calculateRegrind({
    lots: singleLot({ method: 'bulkPercent', percent: 55.5 }, 8000),
    regroundPowderG: 8000,
    targetActiveMgPerTablet: 60,
    targetWeightG: 1.15,
    fillerIngredientName: 'Emdex',
    alreadyPresentIngredientNames: ['PVPP XL'],
    lubricantTopUpIngredientName: 'Magnesium stearate',
  })!;

  const rows = getRunIngredientBreakdown('regrind', result);

  it('includes reground powder, filler (merged with EasyTab), and silicon dioxide', () => {
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.grams]));
    expect(byLabel['Reground powder']).toBeCloseTo(result.regroundPowderG, 6);
    expect(byLabel[result.fillerIngredientName]).toBeCloseTo(result.fillerAddG + result.easyTabG, 6);
    expect(byLabel[result.siliconDioxideIngredientName]).toBeCloseTo(result.siliconDioxideG, 6);
  });

  it('includes the lubricant top-up row when the batch has a reground-tablets lot contribution', () => {
    expect(result.lubricantTopUpG).toBeGreaterThan(0);
    const row = rows.find((r) => r.label === result.lubricantTopUpIngredientName);
    expect(row?.grams).toBeCloseTo(result.lubricantTopUpG, 6);
  });

  it('returns an empty array when mode and result.mode disagree', () => {
    expect(getRunIngredientBreakdown('fresh', result)).toEqual([]);
  });
});

describe('findRunIngredientWeight', () => {
  const freshResult = calculateFreshBatch({
    tabletCount: 10887,
    targetWeightG: 0.69,
    apis: [{ id: 'active', label: 'API', targetActiveMgPerTablet: 60, potency: { method: 'bulkPercent', percent: 76.4 } }],
    ingredients: nonActiveIngredients(),
    fillerType: 'Emdex',
  })!;

  it('matches a real run row (Prisma-shaped mode/result) by label', () => {
    const run = { mode: 'fresh', result: freshResult };
    expect(findRunIngredientWeight(run, 'Emdex')).toBeCloseTo(5379.98, 1);
    expect(findRunIngredientWeight(run, 'API')).toBeCloseTo(855.0, 1);
  });

  it('returns null for a label not present in the run breakdown', () => {
    const run = { mode: 'fresh', result: freshResult };
    expect(findRunIngredientWeight(run, 'Not a real ingredient')).toBeNull();
  });

  it('returns null for an unrecognized mode string', () => {
    expect(findRunIngredientWeight({ mode: 'bogus', result: freshResult }, 'Emdex')).toBeNull();
  });

  it('returns null when result is missing or malformed', () => {
    expect(findRunIngredientWeight({ mode: 'fresh', result: null }, 'Emdex')).toBeNull();
    expect(findRunIngredientWeight({ mode: 'fresh', result: { mode: 'regrind' } }, 'Emdex')).toBeNull();
  });
});
