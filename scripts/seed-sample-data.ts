/**
 * Fills an EMPTY database with a realistic but entirely fictional company's
 * history, so a sandbox has something to explore on day one:
 *
 *   DATABASE_URL=file:/path/to/sandbox.db npm run seed:sample
 *
 * Refuses to touch any database that already has runs, formulations, raw
 * materials or accounts — it can populate a fresh sandbox and nothing else,
 * so it can never be pointed at real data by mistake.
 *
 * Everything is invented: common supplement actives (caffeine, melatonin,
 * vitamin C, zinc, L-theanine), round lot codes, plausible dates. No
 * operator's real products, potencies, batch sizes or controlled substances.
 * Every batch is computed by the real calc engine, so its numbers are
 * internally consistent and it opens in the calculator like any saved run.
 *
 * No accounts are created: the first person to sign up on an empty instance
 * becomes its admin (the invite-only bootstrap), and invites the rest.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { calculateFreshBatch, calculateRegrind, defaultIngredients } from '../lib/calc-engine';
import type { FreshApiEntry, IngredientLine, RegrindLot } from '../lib/calc-engine/types';
import { evaluateNumericResult } from '../lib/lotSpecStatus';
import { getOrCreateDefaultFormulation } from '../lib/formulations';

const prisma = new PrismaClient();
const json = (v: unknown) => v as Prisma.InputJsonValue;
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, hour = 9) => {
  const d = new Date(Date.now() - days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};

type Pct = Partial<Record<'pvpp' | 'magstearate' | 'eztab' | 'silicondioxide', number>>;

/** A fresh batch, computed and stored exactly as the New run page stores it. */
function freshRun(opts: {
  label: string;
  product: string;
  apis: FreshApiEntry[];
  tabletWeightG: number;
  tablets: number;
  filler: string;
  pct: Pct;
}) {
  const ingredients: IngredientLine[] = defaultIngredients()
    .filter((i) => i.role !== 'active')
    .map((i) => (i.calculatedByDifference ? i : { ...i, percentOfBlend: opts.pct[i.id as keyof Pct] ?? 0 }));
  const result = calculateFreshBatch({
    tabletCount: opts.tablets,
    targetWeightG: opts.tabletWeightG,
    apis: opts.apis,
    ingredients,
    fillerType: opts.filler,
  });
  if (!result) throw new Error(`Sample batch ${opts.label} did not calculate`);
  const excipients: Record<string, string> = {};
  for (const i of ingredients) if (!i.calculatedByDifference) excipients[i.id] = String(i.percentOfBlend ?? 0);
  return {
    label: opts.label,
    product: opts.product,
    mode: 'fresh' as const,
    inputs: {
      apis: opts.apis,
      potencyMethod: 'bulkPercent',
      fTwt: String(opts.tabletWeightG),
      fTabs: String(opts.tablets),
      excipients,
      fillerType: opts.filler,
    },
    result,
  };
}

const api = (id: string, label: string, mg: number, potency: number, premixSteps?: number): FreshApiEntry => ({
  id,
  label,
  targetActiveMgPerTablet: mg,
  potency: { method: 'bulkPercent', percent: potency },
  ...(premixSteps ? { premix: { dilutionSteps: premixSteps } } : {}),
});

async function refuseUnlessEmpty() {
  const counts = {
    runs: await prisma.run.count(),
    formulations: await prisma.savedFormulation.count(),
    rawMaterials: await prisma.rawMaterial.count(),
    accounts: await prisma.user.count(),
  };
  const nonEmpty = Object.entries(counts).filter(([, n]) => n > 0);
  if (nonEmpty.length > 0) {
    console.error(
      `Refusing to add sample data: this database already has ${nonEmpty.map(([k, n]) => `${n} ${k}`).join(', ')}.\n` +
        'The sample seed only fills a brand-new, empty database (a sandbox). Point DATABASE_URL at a fresh file.'
    );
    process.exit(1);
  }
}

async function main() {
  console.log(`Target database: ${process.env.DATABASE_URL ?? '(default from .env)'}`);
  await refuseUnlessEmpty();
  const formulation = await getOrCreateDefaultFormulation();

  /* ------------------------------------------------ raw materials & QC */
  const material = async (
    name: string,
    category: string,
    criteria: { parameterName: string; testType: 'qualitative' | 'numeric_range'; minValue?: number; maxValue?: number; targetValue?: number; passCriteriaText?: string }[]
  ) => {
    const m = await prisma.rawMaterial.create({ data: { name, category, createdAt: ago(120) } });
    const spec = await prisma.componentSpec.create({
      data: {
        rawMaterialId: m.id,
        name: `${name} — incoming spec`,
        criteria: {
          create: criteria.map((c) => ({
            parameterName: c.parameterName,
            testType: c.testType,
            minValue: c.minValue ?? null,
            maxValue: c.maxValue ?? null,
            targetValue: c.targetValue ?? null,
            passCriteriaText: c.passCriteriaText ?? null,
          })),
        },
      },
      include: { criteria: true },
    });
    return { m, crit: Object.fromEntries(spec.criteria.map((c) => [c.parameterName, c])) };
  };

  const caffeine = await material('Caffeine anhydrous', 'active', [
    { parameterName: 'Identity (FTIR)', testType: 'qualitative', passCriteriaText: 'Spectrum matches reference standard' },
    { parameterName: 'Assay', testType: 'numeric_range', minValue: 98.5, maxValue: 101.5, targetValue: 100 },
  ]);
  const magSt = await material('Magnesium stearate', 'lubricant', [
    { parameterName: 'Identity (FTIR)', testType: 'qualitative', passCriteriaText: 'Spectrum matches reference standard' },
    { parameterName: 'Loss on drying (%)', testType: 'numeric_range', maxValue: 6 },
  ]);
  const emdex = await material('Emdex', 'filler', [
    { parameterName: 'Identity', testType: 'qualitative', passCriteriaText: 'Matches supplier CoA and appearance' },
  ]);

  const lot = (rawMaterialId: string, lotLabel: string, qty: number, supplier: string, daysAgo: number) =>
    prisma.lot.create({
      data: {
        rawMaterialId,
        lotLabel,
        receivedDate: ago(daysAgo),
        quantityReceivedG: qty,
        quantityRemainingG: qty,
        sourceType: 'purchased',
        supplier,
        createdAt: ago(daysAgo),
      },
    });
  const test = (lotId: string, criterion: { id: string; testType: string; minValue: number | null; maxValue: number | null }, value: number | string, daysAgo: number, pass?: boolean) =>
    prisma.lotSpecTest.create({
      data: {
        lotId,
        specCriterionId: criterion.id,
        resultValue: typeof value === 'number' ? value : null,
        resultText: typeof value === 'string' ? value : null,
        // Numeric verdicts come from the same rule the app uses — never asserted here.
        passFail:
          criterion.testType === 'numeric_range'
            ? evaluateNumericResult(criterion, value as number)!
            : pass!,
        methodUsed: criterion.testType === 'numeric_range' ? 'HPLC' : 'FTIR',
        testedBy: 'QC Lab',
        testedAt: ago(daysAgo, 14),
      },
    });

  const caf1 = await lot(caffeine.m.id, 'CAF-S-001', 25000, 'Sample Supplier Co.', 95);
  await test(caf1.id, caffeine.crit['Identity (FTIR)'], 'Matches reference', 93, true);
  await test(caf1.id, caffeine.crit['Assay'], 99.2, 93);

  const caf2 = await lot(caffeine.m.id, 'CAF-S-002', 25000, 'Sample Supplier Co.', 30);
  await test(caf2.id, caffeine.crit['Identity (FTIR)'], 'Matches reference', 28, true);
  const failed = await test(caf2.id, caffeine.crit['Assay'], 97.9, 28);
  await prisma.oosInvestigation.create({
    data: {
      lotId: caf2.id,
      failedLotSpecTestId: failed.id,
      openedBy: 'QC Lab',
      openedAt: ago(27),
      reasonForInvestigation: 'Assay 97.9% is below the 98.5% minimum. Checking standard prep before any retest.',
      disposition: 'pending',
    },
  });

  await lot(caffeine.m.id, 'CAF-S-003', 25000, 'Second Sample Supplier', 4); // untested: pending

  const ms1 = await lot(magSt.m.id, 'MS-S-001', 20000, 'Sample Excipients Ltd.', 110);
  await test(ms1.id, magSt.crit['Identity (FTIR)'], 'Matches reference', 108, true);
  await test(ms1.id, magSt.crit['Loss on drying (%)'], 3.1, 108);

  const em1 = await lot(emdex.m.id, 'EMD-S-001', 200000, 'Sample Excipients Ltd.', 100);
  await test(em1.id, emdex.crit['Identity'], 'Matches CoA', 99, true);

  /* ------------------------------------------------------------ batches */
  const batches: {
    run: ReturnType<typeof freshRun>;
    daysAgo: number;
    coa?: { mg: number; weight: number; passFail: 'pass' | 'fail'; notes?: string };
    lots?: { lotId: string; grams: (r: ReturnType<typeof freshRun>) => number; role: string }[];
  }[] = [
    {
      run: freshRun({ label: 'CAF100-B01', product: 'Caffeine 100', apis: [api('caf', 'Caffeine anhydrous', 100, 99.2)], tabletWeightG: 0.4, tablets: 50000, filler: 'Emdex', pct: { pvpp: 4, magstearate: 1 } }),
      daysAgo: 84,
      coa: { mg: 99.6, weight: 0.401, passFail: 'pass' },
    },
    {
      run: freshRun({ label: 'CAF100-B02', product: 'Caffeine 100', apis: [api('caf', 'Caffeine anhydrous', 100, 99.2)], tabletWeightG: 0.4, tablets: 50000, filler: 'Emdex', pct: { pvpp: 4, magstearate: 1 } }),
      daysAgo: 45,
      coa: { mg: 100.3, weight: 0.399, passFail: 'pass' },
      lots: [
        { lotId: caf1.id, grams: (r) => r.result.ingredientGrams.caf, role: 'fresh_active' },
        { lotId: ms1.id, grams: (r) => r.result.ingredientGrams.magstearate, role: 'fresh_lubricant' },
        { lotId: em1.id, grams: (r) => r.result.ingredientGrams.emdex, role: 'fresh_filler' },
      ],
    },
    {
      run: freshRun({ label: 'CAF100-B03', product: 'Caffeine 100', apis: [api('caf', 'Caffeine anhydrous', 100, 99.2)], tabletWeightG: 0.4, tablets: 80000, filler: 'Emdex', pct: { pvpp: 4, magstearate: 0.75 } }),
      daysAgo: 9,
    },
    {
      run: freshRun({ label: 'MEL5-B01', product: 'Melatonin 5', apis: [api('mel', 'Melatonin', 5, 99.5, 3)], tabletWeightG: 0.2, tablets: 100000, filler: 'Emdex', pct: { pvpp: 3, magstearate: 0.75, silicondioxide: 0.5 } }),
      daysAgo: 60,
      coa: { mg: 4.6, weight: 0.2, passFail: 'fail', notes: 'Content uniformity out — premix was skipped on this batch.' },
    },
    {
      run: freshRun({ label: 'MEL5-B02', product: 'Melatonin 5', apis: [api('mel', 'Melatonin', 5, 99.5, 3)], tabletWeightG: 0.2, tablets: 100000, filler: 'Emdex', pct: { pvpp: 3, magstearate: 0.75, silicondioxide: 0.5 } }),
      daysAgo: 38,
      coa: { mg: 5.02, weight: 0.201, passFail: 'pass', notes: 'Premix per SOP; uniformity good.' },
    },
    {
      run: freshRun({
        label: 'VCZN-B01',
        product: 'Vitamin C + Zinc',
        apis: [api('vitc', 'Ascorbic acid', 250, 97), api('zn', 'Zinc gluconate (as zinc)', 15, 14.3)],
        tabletWeightG: 0.8,
        tablets: 40000,
        filler: 'Dipac',
        pct: { pvpp: 4, magstearate: 1, eztab: 8 },
      }),
      daysAgo: 21,
      coa: { mg: 251.2, weight: 0.802, passFail: 'pass' },
    },
    {
      run: freshRun({ label: 'LTH100-B01', product: 'L-Theanine 100', apis: [api('lth', 'L-Theanine', 100, 98)], tabletWeightG: 0.35, tablets: 60000, filler: 'Emdex', pct: { pvpp: 5, magstearate: 1 } }),
      daysAgo: 3,
    },
  ];

  const created: Record<string, string> = {};
  for (const b of batches) {
    const run = await prisma.run.create({
      data: {
        label: b.run.label,
        product: b.run.product,
        mode: b.run.mode,
        formulationId: formulation.id,
        inputs: json(b.run.inputs),
        result: json(b.run.result),
        createdAt: ago(b.daysAgo),
        ...(b.coa
          ? {
              actualMgPerTablet: b.coa.mg,
              actualTabletWeight: b.coa.weight,
              passFail: b.coa.passFail,
              notes: b.coa.notes ?? null,
            }
          : {}),
      },
    });
    created[b.run.label] = run.id;
    for (const u of b.lots ?? []) {
      const grams = Math.round(u.grams(b.run) * 100) / 100;
      await prisma.runLotUsage.create({ data: { runId: run.id, lotId: u.lotId, amountUsedG: grams, roleInRun: u.role } });
      await prisma.lot.update({ where: { id: u.lotId }, data: { quantityRemainingG: { decrement: grams } } });
    }
  }

  // One rework: out-of-weight Caffeine 100 tablets reground into a new batch.
  const lots: RegrindLot[] = [
    {
      id: 'lot-1',
      label: 'CAF100-B03 rejects',
      potency: { method: 'mgPerTablet', mgPerOldTablet: 100, oldTabletWeightG: 0.4 },
      weightG: 6000,
      disintegrantPercent: null,
      lubricantPercent: null,
      fillerType: 'Emdex',
      availableStockG: null,
      sourceType: 'regroundTablets',
      isStart: false,
      note: 'Tablets out of weight range after press adjustment',
    },
  ];
  const regrind = calculateRegrind({
    lots,
    regroundPowderG: 6000,
    targetActiveMgPerTablet: 50,
    targetWeightG: 0.4,
    fillerIngredientName: 'EasyTab',
    alreadyPresentIngredientNames: ['PVPP XL'],
    lubricantTopUpIngredientName: 'Magnesium stearate',
  });
  if (!regrind) throw new Error('Sample regrind did not calculate');
  await prisma.run.create({
    data: {
      label: 'CAF50-RW01',
      product: 'Caffeine 50',
      mode: 'regrind',
      formulationId: formulation.id,
      inputs: json({ lots, rgPwd: '6000', rgTmg: '50', rgTwt: '0.4', regrindSolveMode: false, rgTargetTablets: '' }),
      result: json(regrind),
      createdAt: ago(7),
    },
  });

  /* ------------------------------------------------------ formulations */
  const f1 = await prisma.savedFormulation.create({
    data: {
      name: 'Caffeine 100 — reference',
      tabletWeightG: 0.4,
      referenceBatchTablets: 50000,
      actives: json([{ label: 'Caffeine anhydrous', targetMgPerTablet: 100, potencyPercent: 99.2, source: 'CAF-S-001' }]),
      fillerName: 'Emdex',
      disintegrantName: 'PVPP XL',
      disintegrantPercent: 4,
      lubricantName: 'Magnesium stearate',
      lubricantPercent: 1,
      status: 'passed',
      outcomeNotes: 'Two batches in spec. Hardness 8–9 kp.',
      createdAt: ago(90),
    },
  });
  await prisma.savedFormulation.create({
    data: {
      name: 'Caffeine 100 — reference',
      tabletWeightG: 0.4,
      referenceBatchTablets: 50000,
      actives: json([{ label: 'Caffeine anhydrous', targetMgPerTablet: 100, potencyPercent: 99.2, source: 'CAF-S-001' }]),
      fillerName: 'Emdex',
      disintegrantName: 'PVPP XL',
      disintegrantPercent: 4,
      lubricantName: 'Magnesium stearate',
      lubricantPercent: 0.75,
      status: 'issue',
      outcomeNotes: 'Lower lubricant for faster dissolution — some sticking on the punches at the end of the run.',
      lineageId: f1.id,
      parentId: f1.id,
      version: 2,
      createdAt: ago(12),
    },
  });
  await prisma.savedFormulation.create({
    data: {
      name: 'Melatonin 5 — low dose',
      tabletWeightG: 0.2,
      referenceBatchTablets: 100000,
      actives: json([{ label: 'Melatonin', targetMgPerTablet: 5, potencyPercent: 99.5, source: '' }]),
      fillerName: 'Emdex',
      disintegrantName: 'PVPP XL',
      disintegrantPercent: 3,
      lubricantName: 'Magnesium stearate',
      lubricantPercent: 0.75,
      glidantName: 'Silicon dioxide',
      glidantPercent: 0.5,
      otherExcipients: json([{ name: 'Talc', percentOfBlend: 1 }]),
      status: 'untested',
      notes: 'Low-dose active: always premix (geometric dilution, 3 steps).',
      createdAt: ago(35),
    },
  });
  await prisma.savedFormulation.create({
    data: {
      name: 'Vitamin C + Zinc',
      tabletWeightG: 0.8,
      referenceBatchTablets: 40000,
      actives: json([
        { label: 'Ascorbic acid', targetMgPerTablet: 250, potencyPercent: 97, source: '' },
        { label: 'Zinc gluconate (as zinc)', targetMgPerTablet: 15, potencyPercent: 14.3, source: '' },
      ]),
      fillerName: 'Dipac',
      disintegrantName: 'PVPP XL',
      disintegrantPercent: 4,
      lubricantName: 'Magnesium stearate',
      lubricantPercent: 1,
      otherExcipients: json([{ name: 'EZTAB', percentOfBlend: 8 }]),
      status: 'passed',
      createdAt: ago(25),
    },
  });

  /* --------------------------------------------------------- lab notes */
  const notes: { body: string; product?: string; run?: string; daysAgo: number }[] = [
    { body: 'Capping on the last third of CAF100-B03 at 0.40 g. Dropped Mag stearate to 0.75% for dissolution — watch for sticking.', product: 'Caffeine 100', run: 'CAF100-B03', daysAgo: 9 },
    { body: 'MEL5-B01 failed content uniformity (4.6 mg). Premix step was skipped. Premix is now required for this product.', product: 'Melatonin 5', run: 'MEL5-B01', daysAgo: 58 },
    { body: 'Client asked whether the Vitamin C + Zinc tablet can go to 0.75 g. Would need EZTAB down to ~5%.', product: 'Vitamin C + Zinc', daysAgo: 18 },
    { body: 'Press 2 feeder serviced; weight variation back within ±2%.', daysAgo: 30 },
  ];
  for (const n of notes) {
    await prisma.labNote.create({
      data: {
        body: n.body,
        product: n.product ?? null,
        runId: n.run ? created[n.run] : null,
        source: 'typed',
        createdAt: ago(n.daysAgo, 16),
      },
    });
  }

  console.log(
    `Sample data added: ${batches.length + 1} batches across 5 products, 4 formulations, ` +
      `3 raw materials with specs and 5 lots (one failed with an open investigation, one awaiting tests), ` +
      `${notes.length} lab notes. No accounts — the first person to sign up becomes admin.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
