import type { FreshBatchResult, RegrindResult, IngredientLine } from './types';

function fmt(n: number, dec = 1): string {
  if (!isFinite(n) || n <= 0) return '0';
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/**
 * A potency fraction (0-1) as a display percent: 0.7938 -> "79.38",
 * 0.764 -> "76.4", 20.1/0.27/1000 -> "7.444". Trailing zeros are trimmed so a
 * clean assay figure doesn't print as "76.400%", and three decimals are kept
 * so a potency *derived* from mg-per-unit still carries enough digits for an
 * operator to retrace the grams by hand.
 */
function fmtPotencyPct(fraction: number): string {
  if (!isFinite(fraction)) return '0';
  return trim(fraction * 100, 3);
}

/** Fixed-decimal, with trailing zeros dropped — 60 -> "60", 12.50 -> "12.5". */
function trim(n: number, dec: number): string {
  if (!isFinite(n)) return '0';
  return String(parseFloat(n.toFixed(dec)));
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
 *
 * `ingredients` no longer includes any active — combo products can carry
 * more than one, so each gets its own weigh step from result.apis instead.
 * The filler's displayed name follows result.fillerType (e.g. "Dipac"),
 * not the underlying ingredient's static name — purely a label swap, no
 * effect on the grams already computed.
 */
export function generateFreshBatchSOP(
  result: FreshBatchResult,
  ingredients: IngredientLine[]
): string[] {
  // Every ingredient gets a step, even at 0g — omitting a zero/untouched
  // ingredient here would silently hide it from the SOP instead of making
  // the zero visible.
  const lubricants = ingredients.filter((i) => i.role === 'lubricant');

  // The filler is named freely, so it can be the SAME physical material as a
  // fixed excipient (filler "EZTAB" alongside the EZTAB excipient). Weighing
  // instructions must not name it twice: "weigh 49,258.6 g EZTAB ... and
  // 6,527.8 g EZTAB" reads as two separate additions of one material, which
  // is a dispensing error waiting to happen. Same-named entries are summed
  // into one line — the merge regrind already does for its bulk EasyTab
  // filler and its fixed EasyTab processing aid.
  const primary: { name: string; grams: number }[] = [];
  for (const i of ingredients) {
    if (i.role === 'lubricant') continue;
    const name = i.calculatedByDifference ? result.fillerType : i.name;
    const grams = result.ingredientGrams[i.id] ?? 0;
    const existing = primary.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) existing.grams += grams;
    else primary.push({ name, grams });
  }

  const steps: string[] = [];

  // The potency and target dose ride along with the weight: the gram figure
  // alone is unverifiable on the floor, while grams x potency / tablet count
  // reproduces the mg/tab an operator can check against the batch record.
  for (const api of result.apis) {
    steps.push(
      `Weigh ${fmt(result.ingredientGrams[api.id])} g of ${api.label} ` +
        `(${fmtPotencyPct(api.effectivePotency)}% potency, ${trim(api.targetActiveMgPerTablet, 3)} mg/tab target)`
    );
  }
  if (primary.length > 0) {
    steps.push(
      `Weigh ${joinNatural(primary.map((i) => `${fmt(i.grams)} g ${i.name}`))}`
    );
  }
  const vmixNames = [...result.apis.map((a) => a.label), ...primary.map((i) => i.name)];
  if (vmixNames.length > 0) {
    steps.push(`Add ${vmixNames.join(' + ')} to V-mix`);
    steps.push('Mix for 15 minutes');
  }

  // The lubricant goes in last and gets a SHORT final mix — over-mixing
  // magnesium stearate shears it over the granule surface and causes capping
  // and poor hardness. Two minutes, matching the regrind SOP's own lubricant
  // top-up step and floor practice; this was 5 minutes, which is long enough
  // to over-lubricate.
  for (const lube of lubricants) {
    steps.push(`Add ${fmt(result.ingredientGrams[lube.id])} g ${lube.name}`);
  }
  if (lubricants.length > 0) {
    steps.push('Mix for 2 minutes');
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
    // Single-lot wording, otherwise unchanged from before lots existed.
    // Same reasoning as the fresh-batch weigh steps: the powder's own potency
    // is what makes the confirmed weight checkable. Only the confirm step
    // carries it — repeating it on the V-mix step would read as a second,
    // different material.
    steps.push(
      `Weigh reground powder — confirm ${fmt(result.regroundPowderG, 0)} g (${fmtPotencyPct(result.effectivePotency)}% potency)`,
      `Add ${fmt(result.regroundPowderG, 0)} g reground powder to V-mix`
    );
  } else {
    // Per-lot notes are shown in the UI lot breakdown, not duplicated into the SOP text.
    for (const lot of result.lots) {
      const fillerNote = lot.fillerType ? ` — filler: ${lot.fillerType}` : '';
      const flag = lot.isStart ? ' (starts — estimated, low confidence)' : '';
      steps.push(
        `Weigh lot "${lot.label}" — ${fmt(lot.weightG, 0)} g at ${fmtPotencyPct(lot.effectivePotency)}% potency${fillerNote}${flag}`
      );
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
      ? `Add ${fmt(result.freshActiveG)} g fresh API`
      : 'No fresh API needed — regrind covers the full batch',
    // Bulk calculated filler + the fixed 0.15% EasyTab processing aid are the
    // same material, merged into one weigh/add step rather than two.
    `Add ${fmt(result.fillerAddG + result.easyTabG)} g ${result.fillerIngredientName}`,
    'Mix for 15 minutes'
  );
  steps.push(
    `Add ${fmt(result.siliconDioxideG, 2)} g ${result.siliconDioxideIngredientName}`,
    'Mix for 3 minutes'
  );
  // Magnesium stearate is always the LAST ingredient added, after Silicon
  // Dioxide — lubricants risk over-mixing/capping tablets if added earlier,
  // so it gets its own short final mix. Only relevant when at least one lot
  // is marked reground-tablets — a batch made entirely of raw/bulk powder
  // gets no top-up at all, so there's nothing to weigh, add, or mix here.
  if (result.lubricantTopUpG > 0) {
    steps.push(
      `Add ${fmt(result.lubricantTopUpG, 2)} g ${result.lubricantTopUpIngredientName} (0.15% fresh top-up — most is already present in regrind)`,
      'Mix for 2 minutes'
    );
  }
  if (alreadyPresent) {
    steps.push(`Do not add any other fresh ${alreadyPresent} — already present in regrind`);
  }
  steps.push(
    `Compress — target weight ${result.targetWeightG.toFixed(3)} g, check against variance table`
  );
  return steps;
}
