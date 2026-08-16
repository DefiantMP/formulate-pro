import { defaultIngredients } from './calc-engine';
import type { CalcResult } from './calc-engine/types';

export interface RunIngredientRow {
  label: string;
  grams: number;
}

/**
 * Same derivation as getRunIngredientBreakdown, but taking the loosely
 * typed `mode`/`result` shape a Prisma Run row actually has (mode: String,
 * result: Json) and returning a single matched row's grams — or null if the
 * run's mode/result is malformed, or ingredientLabel doesn't match any row.
 * The scale-verification create route uses this to derive expectedWeightG
 * itself from the DB, rather than trusting a client-supplied number.
 */
export function findRunIngredientWeight(
  run: { mode: string; result: unknown },
  ingredientLabel: string
): number | null {
  if (run.mode !== 'fresh' && run.mode !== 'regrind') return null;
  const result = run.result as CalcResult | null | undefined;
  if (!result || (result.mode !== 'fresh' && result.mode !== 'regrind')) return null;
  const row = getRunIngredientBreakdown(run.mode, result).find((r) => r.label === ingredientLabel);
  return row ? row.grams : null;
}

/**
 * Raw ingredient-label -> grams breakdown for a run's already-computed
 * result — the same "Add to V-mix" set shown in FormulateApp's OutputPanel
 * and RunHistoryPage's Materials Used summary, but returning plain numbers
 * instead of pre-formatted display strings, so non-UI consumers (the
 * scale-verification submit flow, which locks its expected weight to one
 * of these rows and re-derives it server-side rather than trusting the
 * client) can reuse the exact same derivation without duplicating this
 * mode-specific and backward-compat-laden branching. No recalculation —
 * purely reads back what calculateFreshBatch/calculateRegrind already
 * produced.
 */
export function getRunIngredientBreakdown(mode: 'fresh' | 'regrind', result: CalcResult): RunIngredientRow[] {
  if (mode === 'fresh' && result.mode === 'fresh') {
    const base = defaultIngredients();
    // `apis` was added to FreshBatchResult after some runs' result JSON was
    // already persisted — older rows predate it entirely (undefined, not
    // just empty), so this can't assume today's shape.
    const rows: RunIngredientRow[] = (result.apis ?? []).map((api) => ({
      label: api.label,
      grams: result.ingredientGrams[api.id] ?? 0,
    }));
    // Pre-multi-API runs keyed the single active ingredient's grams as
    // 'active' directly, with no apis[] entry to read a label from.
    if (rows.length === 0 && result.ingredientGrams['active'] != null) {
      const activeIng = base.find((i) => i.role === 'active');
      rows.push({ label: activeIng?.name ?? 'API', grams: result.ingredientGrams['active'] });
    }
    for (const ing of base) {
      if (ing.role === 'active') continue;
      const grams = result.ingredientGrams[ing.id];
      if (grams == null) continue;
      rows.push({
        label: ing.calculatedByDifference ? (result.fillerType ?? ing.name) : ing.name,
        grams,
      });
    }
    return rows;
  }
  if (mode === 'regrind' && result.mode === 'regrind') {
    const rows: RunIngredientRow[] = [];
    rows.push({ label: 'Reground powder', grams: result.regroundPowderG });
    if (result.freshActiveG > 0) {
      rows.push({ label: 'Fresh active', grams: result.freshActiveG });
    }
    // easyTabG/siliconDioxideG/lubricantTopUpG were added to the calc
    // engine after some saved runs' result JSON was persisted — those
    // older rows simply lack the fields (undefined), so every reference
    // here must tolerate that rather than assume today's RegrindResult shape.
    rows.push({
      label: result.fillerIngredientName,
      grams: result.fillerAddG + (result.easyTabG ?? 0),
    });
    if (result.lubricantTopUpG > 0 && result.lubricantTopUpIngredientName) {
      rows.push({ label: result.lubricantTopUpIngredientName, grams: result.lubricantTopUpG });
    }
    if (result.siliconDioxideIngredientName) {
      rows.push({ label: result.siliconDioxideIngredientName, grams: result.siliconDioxideG ?? 0 });
    }
    return rows;
  }
  return [];
}
