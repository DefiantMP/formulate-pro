import { describe, it, expect } from 'vitest';
import {
  outcomeOf,
  productsFrom,
  summarizePriorRun,
  summarizePriorRuns,
  type RunForSummary,
} from './productHistory';

const baseRun: RunForSummary = {
  id: 'run1',
  label: 'OGS batch 3',
  product: 'OGS',
  mode: 'fresh',
  createdAt: '2026-08-01T10:00:00.000Z',
  inputs: {
    ingredients: [
      { id: 'pvpp', name: 'PVPP XL', role: 'other', percentOfBlend: 5, calculatedByDifference: false },
      { id: 'emdex', name: 'Emdex', role: 'filler', percentOfBlend: null, calculatedByDifference: true },
    ],
  },
  result: {
    mode: 'fresh',
    tabletCount: 10887,
    targetWeightG: 0.69,
    fillerType: 'Emdex',
    apis: [{ label: 'API active', targetActiveMgPerTablet: 60, effectivePotency: 0.764 }],
  },
};

describe('outcomeOf', () => {
  it('distinguishes a missing COA from a failed one', () => {
    expect(outcomeOf({ passFail: 'pass' })).toBe('passed');
    expect(outcomeOf({ passFail: 'fail' })).toBe('failed');
    // The distinction that matters: most runs have no COA, and reporting
    // those as anything but unknown would invent a verdict.
    expect(outcomeOf({ passFail: null })).toBe('not_recorded');
    expect(outcomeOf({})).toBe('not_recorded');
  });
});

describe('summarizePriorRun', () => {
  it('pulls the figures needed to start the next batch', () => {
    const s = summarizePriorRun(baseRun);
    expect(s.tabletWeightG).toBe(0.69);
    expect(s.tabletCount).toBe(10887);
    expect(s.fillerName).toBe('Emdex');
    expect(s.actives).toEqual([
      { label: 'API active', targetMgPerTablet: 60, potencyPercent: 76.4 },
    ]);
  });

  it('excludes the calculated-by-difference filler from excipients', () => {
    // Its percentage is an output of the last batch, not an input to the next.
    const s = summarizePriorRun(baseRun);
    expect(s.excipients).toEqual([{ name: 'PVPP XL', percentOfBlend: 5 }]);
  });

  it('reads the excipient shape the calculator actually saves', () => {
    // Taken from a real stored run: inputs carry `excipients` as an id ->
    // STRING map, with no `ingredients` array at all. Reading only the array
    // shape yielded no excipients for every run ever saved by the New run
    // page, which is precisely the bug this pins.
    const real: RunForSummary = {
      ...baseRun,
      inputs: { excipients: { pvpp: '10', magstearate: '1.5', eztab: '100' } },
      result: {
        mode: 'fresh',
        tabletCount: 112549,
        targetWeightG: 0.58,
        fillerType: 'Emdex',
        ingredientPercents: { active: 3.04, emdex: 0, pvpp: 10, magstearate: 1.5, eztab: 100 },
        apis: [{ label: '7OH', targetActiveMgPerTablet: 14, effectivePotency: 0.7938 }],
      },
    };
    const s = summarizePriorRun(real);
    expect(s.excipients).toEqual([
      { name: 'PVPP XL', percentOfBlend: 10 },
      { name: 'Magnesium stearate', percentOfBlend: 1.5 },
      { name: 'EZTAB', percentOfBlend: 100 },
    ]);
    // The by-difference filler stays out even though it has a percentage.
    expect(s.excipients.map((e) => e.name)).not.toContain('Emdex');
  });

  it('reads a pre-combo-product run that stored a single scalar active', () => {
    const legacy: RunForSummary = {
      ...baseRun,
      result: {
        mode: 'fresh',
        tabletCount: 5000,
        targetWeightG: 0.7,
        targetActiveMgPerTablet: 35,
        potencyPercent: 80,
      },
    };
    const s = summarizePriorRun(legacy);
    expect(s.actives).toEqual([{ label: 'Active', targetMgPerTablet: 35, potencyPercent: 80 }]);
  });

  it('does not invent figures for a run whose result predates these fields', () => {
    const sparse: RunForSummary = { ...baseRun, inputs: {}, result: { mode: 'fresh' } };
    const s = summarizePriorRun(sparse);
    expect(s.tabletWeightG).toBeNull();
    expect(s.tabletCount).toBeNull();
    expect(s.fillerName).toBeNull();
    expect(s.actives).toEqual([]);
    expect(s.excipients).toEqual([]);
  });

  it('survives a run with no result at all', () => {
    const s = summarizePriorRun({ ...baseRun, result: undefined, inputs: undefined });
    expect(s.actives).toEqual([]);
    expect(s.outcome).toBe('not_recorded');
  });

  it('carries COA figures through when they were recorded', () => {
    const s = summarizePriorRun({
      ...baseRun,
      passFail: 'pass',
      actualMgPerTablet: 59.2,
      actualTabletWeight: 0.688,
    });
    expect(s.outcome).toBe('passed');
    expect(s.actualMgPerTablet).toBe(59.2);
    expect(s.actualTabletWeight).toBe(0.688);
  });
});

describe('summarizePriorRuns', () => {
  it('returns most recent first', () => {
    const older = { ...baseRun, id: 'old', createdAt: '2026-07-01T10:00:00.000Z' };
    const newer = { ...baseRun, id: 'new', createdAt: '2026-08-15T10:00:00.000Z' };
    expect(summarizePriorRuns([older, newer]).map((r) => r.runId)).toEqual(['new', 'old']);
  });
});

describe('productsFrom', () => {
  it('counts distinct products and ignores unset ones', () => {
    expect(
      productsFrom([
        { product: 'OGS' },
        { product: 'OGS' },
        { product: 'RR77' },
        { product: null },
        { product: '   ' },
      ])
    ).toEqual([
      { product: 'OGS', runCount: 2 },
      { product: 'RR77', runCount: 1 },
    ]);
  });
});
