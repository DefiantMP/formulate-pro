import type { FreshBatchResult, RegrindResult, IngredientLine } from './types';

function fmt(n: number, dec = 1): string {
  if (!isFinite(n) || n <= 0) return '0';
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function generateFreshBatchSOP(
  result: FreshBatchResult,
  ingredients: IngredientLine[]
): string[] {
  const active = ingredients.find((i) => i.role === 'active')!;
  const lubricant = ingredients.find((i) => i.role === 'lubricant');
  const disintegrant = ingredients.find((i) => i.role === 'disintegrant');
  const filler = ingredients.find((i) => i.calculatedByDifference)!;

  const activeG = result.ingredientGrams[active.id];
  const fillerG = result.ingredientGrams[filler.id];
  const lubricantG = lubricant ? result.ingredientGrams[lubricant.id] : undefined;
  const disintegrantG = disintegrant ? result.ingredientGrams[disintegrant.id] : undefined;

  const steps: string[] = [`Weigh ${fmt(activeG)} g of ${active.name}`];

  const nonLubricantParts = [`${fmt(fillerG)} g ${filler.name}`];
  if (disintegrant && disintegrantG !== undefined) {
    nonLubricantParts.push(`${fmt(disintegrantG)} g ${disintegrant.name}`);
  }
  steps.push(`Weigh ${nonLubricantParts.join(' and ')}`);
  steps.push(`Add active + ${nonLubricantParts.map((p) => p.split(' ').slice(2).join(' ')).join(' + ')} to V-mix`);
  steps.push('Mix for 15 minutes');
  if (lubricant && lubricantG !== undefined) {
    steps.push(`Add ${fmt(lubricantG)} g ${lubricant.name}`);
    steps.push('Mix for 5 minutes');
  }
  steps.push(
    `Compress — target weight ${result.targetWeightG.toFixed(3)} g, check against variance table`
  );
  return steps;
}

export function generateRegrindSOP(result: RegrindResult): string[] {
  const alreadyPresent = result.alreadyPresentIngredientNames.join(' or ');
  const steps: string[] = [
    'Grind old tablets to fine powder',
    `Weigh reground powder — confirm ${fmt(result.regroundPowderG, 0)} g`,
    `Add ${fmt(result.regroundPowderG, 0)} g reground powder to V-mix`,
    result.freshActiveG > 0
      ? `Add ${fmt(result.freshActiveG)} g fresh active`
      : 'No fresh active needed — regrind active covers the full batch',
    `Add ${fmt(result.fillerAddG)} g ${result.fillerIngredientName}`,
    'Mix for 15 minutes',
  ];
  if (alreadyPresent) {
    steps.push(`Do not add fresh ${alreadyPresent} — already present in regrind`);
  }
  steps.push(
    `Compress — target weight ${result.targetWeightG.toFixed(3)} g, check against variance table`
  );
  return steps;
}
