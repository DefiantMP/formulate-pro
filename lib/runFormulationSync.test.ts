import { describe, it, expect } from 'vitest';
import { calculateFreshBatch, calculateRegrind, defaultIngredients } from './calc-engine';
import type { IngredientLine, FreshApiEntry } from './calc-engine/types';
import { deriveFormulationFromRun } from './runFormulationSync';

function nonActiveIngredients(): IngredientLine[] {
  return defaultIngredients().filter((i) => i.role !== 'active');
}

describe('deriveFormulationFromRun — fresh mode', () => {
  // Same RR77-PB9 golden fixture used in calcEngine.test.ts — real
  // calculateFreshBatch output, not a hand-crafted mock, so this catches
  // drift if the result shape ever changes.
  const result = calculateFreshBatch({
    tabletCount: 10887,
    targetWeightG: 0.69,
    apis: [{ id: 'active', label: 'API', targetActiveMgPerTablet: 60, potency: { method: 'bulkPercent', percent: 76.4 } }],
    ingredients: nonActiveIngredients(),
    fillerType: 'Emdex',
  })!;

  const derived = deriveFormulationFromRun('RR77-PB9 batch 1', 'fresh', result);

  it('maps tablet weight and tablet count directly', () => {
    expect(derived.tabletWeightG).toBe(0.69);
    expect(derived.referenceBatchTablets).toBe(10887);
  });

  it('uses the run label as the formulation name', () => {
    expect(derived.name).toBe('RR77-PB9 batch 1');
  });

  it('maps the single API to one active with matching potency', () => {
    expect(derived.actives).toHaveLength(1);
    expect(derived.actives[0]).toMatchObject({ label: 'API', targetMgPerTablet: 60 });
    expect(derived.actives[0].potencyPercent).toBeCloseTo(76.4, 6);
  });

  it('maps filler, disintegrant, and lubricant by name and resolved %', () => {
    expect(derived.fillerName).toBe('Emdex');
    expect(derived.disintegrantName).toBe('PVPP XL');
    expect(derived.disintegrantPercent).toBeCloseTo(5, 6);
    expect(derived.lubricantName).toBe('Magnesium stearate');
    expect(derived.lubricantPercent).toBeCloseTo(2, 6);
  });

  it('flags the unmapped EZTAB gap in notes rather than silently dropping it', () => {
    expect(derived.notes).toContain('EZTAB');
    expect(derived.notes).toMatch(/10\.00%/);
    expect(derived.notes).toContain('RR77-PB9 batch 1');
  });

  it('maps every API to its own active entry for a multi-API combo product', () => {
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
    const comboDerived = deriveFormulationFromRun('Combo run', 'fresh', comboResult);

    expect(comboDerived.actives).toHaveLength(2);
    expect(comboDerived.actives.map((a) => a.label)).toEqual(['Vitamin D3', 'Vitamin K2']);
    expect(comboDerived.actives[0].potencyPercent).toBeCloseTo(90, 6);
    expect(comboDerived.actives[1].potencyPercent).toBeCloseTo(1, 6);
    expect(comboDerived.fillerName).toBe('Dipac');
  });
});

describe('deriveFormulationFromRun — regrind mode', () => {
  const result = calculateRegrind({
    lots: [
      {
        id: 'lot1',
        label: 'Lot 1',
        potency: { method: 'bulkPercent', percent: 55.5 },
        weightG: 8000,
        disintegrantPercent: null,
        lubricantPercent: null,
        fillerType: '',
        availableStockG: null,
        sourceType: 'regroundTablets',
        isStart: false,
        note: '',
      },
    ],
    regroundPowderG: 8000,
    targetActiveMgPerTablet: 60,
    targetWeightG: 1.15,
    fillerIngredientName: 'Emdex',
    alreadyPresentIngredientNames: ['PVPP XL'],
    lubricantTopUpIngredientName: 'Magnesium stearate',
  })!;

  const derived = deriveFormulationFromRun('Regrind batch 1', 'regrind', result);

  it('maps tablet weight and tablet count directly', () => {
    expect(derived.tabletWeightG).toBe(1.15);
    expect(derived.referenceBatchTablets).toBe(74000);
  });

  it('maps to a single active using the reground powder\'s own effectivePotency', () => {
    expect(derived.actives).toHaveLength(1);
    expect(derived.actives[0].targetMgPerTablet).toBe(60);
    expect(derived.actives[0].potencyPercent).toBeCloseTo(55.5, 6);
  });

  it('maps filler and disintegrant/lubricant names, leaving percentages null (not tracked as %-of-blend for regrind)', () => {
    expect(derived.fillerName).toBe('Emdex');
    expect(derived.disintegrantName).toBe('PVPP XL');
    expect(derived.disintegrantPercent).toBeNull();
    expect(derived.lubricantName).toBe('Magnesium stearate');
    expect(derived.lubricantPercent).toBeNull();
  });

  it('documents the regrind %-of-blend gap in notes', () => {
    expect(derived.notes).toMatch(/aren't tracked as a %-of-blend/);
    expect(derived.notes).toContain('Regrind batch 1');
  });
});
