import type { FreshBatchResult, RegrindResult, IngredientLine } from './types';

function fmt(n: number, dec = 1): string {
  if (!isFinite(n) || n <= 0) return '0';
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Joins items as "A", "A and B", or "A, B, and C" — natural for a weighing instruction. */
function joinNatural(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Generic across any ingredient count: every ingredient gets a weigh + V-mix
 * step (even at 0g, so a zero amount is visible rather than silently
 * omitted), in the order it appears in `ingredients`. Lubricants are added
 * last (and mixed briefly after), since over-mixing lubricant is a real
 * capping/hardness risk — everything else (active, filler, disintegrant, or
 * any other role) goes into the initial V-mix together.
 */
export function generateFreshBatchSOP(
  result: FreshBatchResult,
  ingredients: IngredientLine[]
): string[] {
  // Every ingredient gets a step, even at 0g — omitting a zero/untouched
  // ingredient here would silently hide it from the SOP instead of making
  // the zero visible.
  const lubricants = ingredients.filter((i) => i.role === 'lubricant');
  const primary = ingredients.filter((i) => i.role !== 'lubricant');
  const active = primary.find((i) => i.role === 'active');
  const otherPrimary = primary.filter((i) => i.role !== 'active');

  const steps: string[] = [];

  if (active) {
    steps.push(`Weigh ${fmt(result.ingredientGrams[active.id])} g of ${active.name}`);
  }
  if (otherPrimary.length > 0) {
    steps.push(
      `Weigh ${joinNatural(otherPrimary.map((i) => `${fmt(result.ingredientGrams[i.id])} g ${i.name}`))}`
    );
  }
  if (primary.length > 0) {
    steps.push(`Add ${primary.map((i) => i.name).join(' + ')} to V-mix`);
    steps.push('Mix for 15 minutes');
  }

  for (const lube of lubricants) {
    steps.push(`Add ${fmt(result.ingredientGrams[lube.id])} g ${lube.name}`);
  }
  if (lubricants.length > 0) {
    steps.push('Mix for 5 minutes');
  }

  steps.push(
    `Compress — target weight ${result.targetWeightG.toFixed(3)} g, check against variance table`
  );
  return steps;
}

export function generateRegrindSOP(result: RegrindResult): string[] {
  const alreadyPresent = result.alreadyPresentIngredientNames.join(' or ');
  const steps: string[] = ['Grind old tablets to fine powder'];

  if (result.lots.length <= 1) {
    // Single-lot wording is unchanged from before lots existed.
    steps.push(
      `Weigh reground powder — confirm ${fmt(result.regroundPowderG, 0)} g`,
      `Add ${fmt(result.regroundPowderG, 0)} g reground powder to V-mix`
    );
  } else {
    // Per-lot notes are shown in the UI lot breakdown, not duplicated into the SOP text.
    for (const lot of result.lots) {
      const fillerNote = lot.fillerType ? ` — filler: ${lot.fillerType}` : '';
      const flag = lot.isStart ? ' (starts — estimated, low confidence)' : '';
      steps.push(`Weigh lot "${lot.label}" — ${fmt(lot.weightG, 0)} g${fillerNote}${flag}`);
    }
    const mismatchNote = result.regroundPowderMismatch
      ? ` — does not match entered lot weights (${fmt(result.lotWeightSum, 0)} g), re-check`
      : '';
    steps.push(
      `Combine all lots — confirm total reground powder ${fmt(result.regroundPowderG, 0)} g${mismatchNote}`,
      `Add ${fmt(result.regroundPowderG, 0)} g combined reground powder to V-mix`
    );
  }

  steps.push(
    result.freshActiveG > 0
      ? `Add ${fmt(result.freshActiveG)} g fresh active`
      : 'No fresh active needed — regrind active covers the full batch',
    `Add ${fmt(result.fillerAddG)} g ${result.fillerIngredientName}`,
    'Mix for 15 minutes'
  );
  if (alreadyPresent) {
    steps.push(`Do not add fresh ${alreadyPresent} — already present in regrind`);
  }
  steps.push(
    `Compress — target weight ${result.targetWeightG.toFixed(3)} g, check against variance table`
  );
  return steps;
}
