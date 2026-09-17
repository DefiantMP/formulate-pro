import { describe, it, expect } from 'vitest';
import {
  outcomeOf,
  productsFrom,
  summarizePriorRun,
  summarizePriorRuns,
  type RunForSummary,
  summarizeFigure,
  summarizeProduct,
  summarizeProducts,
  type PriorRunSummary,
  type PriorActive,
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

describe('summarizeFigure', () => {
  it('reports the median, not the mean — an average of unlike batches is a dose nobody made', () => {
    const f = summarizeFigure([60, 60, 14])!;
    expect(f.median).toBe(60);
    expect(f).toMatchObject({ min: 14, max: 60, count: 3, varies: true });
  });

  it('averages the middle pair on an even count', () => {
    expect(summarizeFigure([10, 20, 30, 40])!.median).toBe(25);
  });

  it('calls a tight spread settled and a wide one varying', () => {
    expect(summarizeFigure([0.69, 0.69, 0.7])!.varies).toBe(false);
    expect(summarizeFigure([0.69, 0.8])!.varies).toBe(true);
  });

  it('treats any spread around zero as varying — there is no percent of zero', () => {
    expect(summarizeFigure([0, 0])!.varies).toBe(false);
    expect(summarizeFigure([0, 0, 5])!.varies).toBe(true);
  });

  it('returns null when nothing was recorded', () => {
    expect(summarizeFigure([])).toBeNull();
    expect(summarizeFigure([NaN, Infinity])).toBeNull();
  });
});

describe('summarizeProduct', () => {
  const run = (over: Partial<PriorRunSummary> = {}): PriorRunSummary => ({
    runId: Math.random().toString(36).slice(2),
    label: 'R',
    product: 'PB50',
    createdAt: '2026-07-01T00:00:00.000Z',
    mode: 'fresh',
    outcome: 'not_recorded',
    tabletWeightG: 0.69,
    tabletCount: 10000,
    actives: [{ label: '7OH', targetMgPerTablet: 60, potencyPercent: 76.4 }],
    fillerName: 'Emdex',
    excipients: [
      { name: 'PVPP XL', percentOfBlend: 5 },
      { name: 'Magnesium stearate', percentOfBlend: 2 },
    ],
    actualMgPerTablet: null,
    actualTabletWeight: null,
    notes: null,
    ...over,
  });

  it('summarises counts, dates and COA outcomes', () => {
    const s = summarizeProduct('PB50', [
      run({ createdAt: '2026-07-01T00:00:00.000Z', outcome: 'passed' }),
      run({ createdAt: '2026-08-01T00:00:00.000Z', outcome: 'failed' }),
      run({ createdAt: '2026-07-15T00:00:00.000Z' }),
    ])!;
    expect(s).toMatchObject({
      product: 'PB50',
      runCount: 3,
      freshCount: 3,
      regrindCount: 0,
      passedCount: 1,
      failedCount: 1,
      coaRecordedCount: 2,
      firstRunAt: '2026-07-01T00:00:00.000Z',
      lastRunAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('builds the typical recipe from the runs, marking what varies', () => {
    const s = summarizeProduct('PB50', [
      run(),
      run({ excipients: [{ name: 'PVPP XL', percentOfBlend: 5 }, { name: 'Magnesium stearate', percentOfBlend: 2 }] }),
      run({ excipients: [{ name: 'PVPP XL', percentOfBlend: 10 }, { name: 'Magnesium stearate', percentOfBlend: 2 }] }),
    ])!;
    const pvpp = s.excipients.find((e) => e.name === 'PVPP XL')!;
    const mag = s.excipients.find((e) => e.name === 'Magnesium stearate')!;
    expect(pvpp.percentOfBlend).toMatchObject({ median: 5, min: 5, max: 10, varies: true });
    expect(mag.percentOfBlend).toMatchObject({ median: 2, varies: false });
    expect(s.actives[0]).toMatchObject({ label: '7OH', runCount: 3 });
  });

  // A regrind's excipients came in with the reworked material — folding them
  // into a recipe would describe a blend nobody weighed out.
  it('keeps regrind runs out of the typical recipe but counts them', () => {
    const s = summarizeProduct('PB50', [
      run({ mode: 'regrind', excipients: [{ name: 'EasyTab', percentOfBlend: 90 }], actives: [] }),
      run(),
    ])!;
    expect(s.runCount).toBe(2);
    expect(s.regrindCount).toBe(1);
    expect(s.excipients.some((e) => e.name === 'EasyTab')).toBe(false);
    expect(s.excipients.every((e) => e.runCount === 1)).toBe(true);
  });

  it('gives a regrind-only product no fabricated recipe', () => {
    const s = summarizeProduct('PB50', [run({ mode: 'regrind' })])!;
    expect(s.freshCount).toBe(0);
    expect(s.excipients).toEqual([]);
    expect(s.actives).toEqual([]);
    expect(s.tabletWeightG).toBeNull();
  });

  it('shows every filler a product has used, most used first', () => {
    const s = summarizeProduct('PB50', [run(), run(), run({ fillerName: 'Dipac' })])!;
    expect(s.fillers).toEqual([
      { name: 'Emdex', runCount: 2 },
      { name: 'Dipac', runCount: 1 },
    ]);
  });

  // Real data: one product's runs recorded its filler as "EZTAB", "EZTab" and
  // "EZTAB " — one material typed three ways, which read as three fillers.
  it('treats names differing only in case or spacing as one material', () => {
    const s = summarizeProduct('PB50', [
      run({ fillerName: 'EZTAB', excipients: [{ name: 'Magnesium stearate', percentOfBlend: 1 }] }),
      run({ fillerName: 'EZTab', excipients: [{ name: 'magnesium stearate', percentOfBlend: 1 }] }),
      run({ fillerName: 'EZTAB ', excipients: [{ name: ' Magnesium Stearate', percentOfBlend: 1 }] }),
    ])!;
    expect(s.fillers).toEqual([{ name: 'EZTAB', runCount: 3 }]);
    expect(s.excipients).toHaveLength(1);
    expect(s.excipients[0]).toMatchObject({ name: 'Magnesium stearate', runCount: 3 });
  });

  it('shows the spelling used most often', () => {
    const s = summarizeProduct('PB50', [
      run({ fillerName: 'eztab' }),
      run({ fillerName: 'EZTAB' }),
      run({ fillerName: 'EZTAB' }),
    ])!;
    expect(s.fillers).toEqual([{ name: 'EZTAB', runCount: 3 }]);
  });

  it('groups actives typed with different capitalisation too', () => {
    const s = summarizeProduct('PB50', [
      run({ actives: [{ label: '7OH', targetMgPerTablet: 14, potencyPercent: 79 }] }),
      run({ actives: [{ label: '7oh ', targetMgPerTablet: 14, potencyPercent: 80 }] }),
    ])!;
    expect(s.actives).toHaveLength(1);
    expect(s.actives[0]).toMatchObject({ label: '7OH', runCount: 2 });
  });

  it('returns null for a product with no runs', () => {
    expect(summarizeProduct('PB50', [])).toBeNull();
  });
});

describe('summarizeProducts', () => {
  const base = {
    label: 'R',
    createdAt: '2026-07-01T00:00:00.000Z',
    mode: 'fresh' as const,
    outcome: 'not_recorded' as const,
    tabletWeightG: 0.69,
    tabletCount: 10000,
    actives: [],
    fillerName: null,
    excipients: [],
    actualMgPerTablet: null,
    actualTabletWeight: null,
    notes: null,
  };

  it('groups by product, most recently made first, and ignores unnamed runs', () => {
    const list = summarizeProducts([
      { ...base, runId: '1', product: 'PB50', createdAt: '2026-07-01T00:00:00.000Z' },
      { ...base, runId: '2', product: 'RR77', createdAt: '2026-09-01T00:00:00.000Z' },
      { ...base, runId: '3', product: 'PB50', createdAt: '2026-08-01T00:00:00.000Z' },
      { ...base, runId: '4', product: null },
      { ...base, runId: '5', product: '   ' },
    ]);
    expect(list.map((p) => [p.product, p.runCount])).toEqual([
      ['RR77', 1],
      ['PB50', 2],
    ]);
  });
});
