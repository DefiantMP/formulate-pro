import { PrismaClient, type Prisma } from '@prisma/client';
import { defaultIngredients, calculateFreshBatch, calculateRegrind } from '../lib/calc-engine';
import type { IngredientLine, PotencyInput, RegrindLot, FreshApiEntry, FreshApiPotency } from '../lib/calc-engine/types';

function singleApi(potency: FreshApiPotency, targetActiveMgPerTablet: number): FreshApiEntry[] {
  return [{ id: 'active', label: 'API', targetActiveMgPerTablet, potency }];
}

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
import { getOrCreateDefaultFormulation } from '../lib/formulations';

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

const prisma = new PrismaClient();

async function main() {
  const ingredients = defaultIngredients();
  const formulation = await getOrCreateDefaultFormulation();

  const existingRuns = await prisma.run.count();
  if (existingRuns > 0) {
    console.log('Runs already exist — skipping sample run seed.');
    return;
  }

  const freshIngredients: IngredientLine[] = ingredients
    .filter((i) => i.role !== 'active')
    .map((i) => {
      if (i.id === 'magstearate') return { ...i, percentOfBlend: 2 };
      if (i.id === 'pvpp') return { ...i, percentOfBlend: 5 };
      return i; // any other excipient (e.g. EZTAB) keeps its formulation default
    });
  const freshApis = singleApi({ method: 'bulkPercent', percent: 55.5 }, 35);
  const freshResult = calculateFreshBatch({
    tabletCount: 133623,
    targetWeightG: 0.69,
    apis: freshApis,
    ingredients: freshIngredients,
    fillerType: 'Emdex',
  });

  // Built generically (not hardcoded to pvpp/magstearate) so this stays in
  // sync with whatever excipients the default formulation actually has —
  // otherwise reloading this run in the UI would silently drop any
  // ingredient not captured here back to 0%.
  const freshExcipients: Record<string, string> = {};
  for (const i of freshIngredients) {
    if (!i.calculatedByDifference) {
      freshExcipients[i.id] = String(i.percentOfBlend ?? '');
    }
  }

  const regrindBPotency: PotencyInput = {
    method: 'mgPerTablet',
    mgPerOldTablet: 20.1,
    oldTabletWeightG: 0.27,
  };
  const regrindBResult = calculateRegrind({
    lots: singleLot(regrindBPotency, 14500),
    regroundPowderG: 14500,
    targetActiveMgPerTablet: 35,
    targetWeightG: 0.8,
    fillerIngredientName: 'Emdex',
    alreadyPresentIngredientNames: ['PVPP XL'],
    lubricantTopUpIngredientName: 'Magnesium stearate',
  });

  const regrindAPotency: PotencyInput = { method: 'bulkPercent', percent: 55.5 };
  const regrindAResult = calculateRegrind({
    lots: singleLot(regrindAPotency, 8000),
    regroundPowderG: 8000,
    targetActiveMgPerTablet: 60,
    targetWeightG: 1.15,
    fillerIngredientName: 'Emdex',
    alreadyPresentIngredientNames: ['PVPP XL'],
    lubricantTopUpIngredientName: 'Magnesium stearate',
  });

  if (!freshResult || !regrindBResult || !regrindAResult) {
    throw new Error('Sample run calculation returned null during seed.');
  }

  const now = Date.now();

  await prisma.run.createMany({
    data: [
      {
        label: 'PB21RW35D',
        mode: 'regrind',
        formulationId: formulation.id,
        inputs: asJson({ opt: 'b', bMg: '20.1', bWt: '0.270', rgPwd: '14500', rgTmg: '35', rgTwt: '0.800' }),
        result: asJson(regrindBResult),
        createdAt: new Date(now),
      },
      {
        label: 'RR35 PB3',
        mode: 'fresh',
        formulationId: formulation.id,
        inputs: asJson({
          apis: freshApis,
          potencyMethod: 'bulkPercent',
          fTwt: '0.69',
          fTabs: '133623',
          excipients: freshExcipients,
          fillerType: 'Emdex',
        }),
        result: asJson(freshResult),
        createdAt: new Date(now - 60_000),
      },
      {
        label: 'RG-60 Test',
        mode: 'regrind',
        formulationId: formulation.id,
        inputs: asJson({ opt: 'a', aPot: '55.5', rgPwd: '8000', rgTmg: '60', rgTwt: '1.15' }),
        result: asJson(regrindAResult),
        createdAt: new Date(now - 120_000),
      },
    ],
  });

  console.log('Seeded default formulation and 3 sample runs.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
