/**
 * Condenses a saved Run down to the handful of figures an operator needs when
 * starting the next batch of the same product.
 *
 * Pure functions over plain shapes, no DB access — same pattern as
 * lib/lotSpecStatus.ts and lib/runIngredientBreakdown.ts, so the derivation is
 * testable without a database and can be reused by an API route or the UI.
 *
 * Everything here reads from a run's STORED result JSON, which is the record
 * of what that batch actually computed. Older runs predate fields the engine
 * added later (apis[] replaced scalar potency fields; easyTabG/siliconDioxideG
 * came later still), so every access is written to tolerate them being absent
 * rather than merely zero — the same backward-compat rule loadRun and the Run
 * History page already follow.
 */

import { defaultIngredients } from './calc-engine';

/** What a past run recorded for one active. */
export interface PriorActive {
  label: string;
  targetMgPerTablet: number;
  /** Percent (0-100) of the raw material that is active. */
  potencyPercent: number;
}

export interface PriorExcipient {
  name: string;
  percentOfBlend: number;
}

/**
 * A run's COA outcome as it should be shown next to its numbers.
 *
 * 'not_recorded' is deliberately distinct from 'failed': most runs have no COA
 * entered, and showing those as anything other than "unknown" would imply a
 * verdict nobody gave. This mirrors the lot spec rule that an untested thing
 * is pending, never pass.
 */
export type PriorRunOutcome = 'passed' | 'failed' | 'not_recorded';

export interface PriorRunSummary {
  runId: string;
  label: string;
  product: string | null;
  createdAt: string;
  mode: 'fresh' | 'regrind';
  outcome: PriorRunOutcome;
  /** Null for a regrind run, whose tablet weight lives in different fields. */
  tabletWeightG: number | null;
  tabletCount: number | null;
  actives: PriorActive[];
  fillerName: string | null;
  excipients: PriorExcipient[];
  /** COA figures, when the operator recorded them. */
  actualMgPerTablet: number | null;
  actualTabletWeight: number | null;
  notes: string | null;
}

export interface RunForSummary {
  id: string;
  label: string;
  product?: string | null;
  mode: string;
  createdAt: string | Date;
  inputs?: unknown;
  result?: unknown;
  passFail?: string | null;
  actualMgPerTablet?: number | null;
  actualTabletWeight?: number | null;
  notes?: string | null;
}

export function outcomeOf(run: Pick<RunForSummary, 'passFail'>): PriorRunOutcome {
  if (run.passFail === 'pass') return 'passed';
  if (run.passFail === 'fail') return 'failed';
  return 'not_recorded';
}

export const OUTCOME_LABELS: Record<PriorRunOutcome, string> = {
  passed: 'COA passed',
  failed: 'COA failed',
  not_recorded: 'No COA recorded',
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Percent of raw material that is active, from either potency method.
 *
 * The engine stores effectivePotency as a 0-1 fraction on each API result;
 * that is the one field present regardless of whether the operator entered a
 * bulk percentage or mg-per-unit, so it's what we read rather than trying to
 * reconstruct the original entry method.
 */
function potencyPercentOf(api: Record<string, unknown>): number {
  const eff = num(api.effectivePotency);
  if (eff !== null) return eff * 100;
  // Pre-combo-product runs stored a scalar potencyPercent on the result.
  const legacy = num(api.potencyPercent);
  return legacy ?? 0;
}

function activesOf(result: Record<string, unknown>): PriorActive[] {
  const apis = result.apis;
  if (Array.isArray(apis) && apis.length > 0) {
    return apis.map((raw, i) => {
      const api = (raw ?? {}) as Record<string, unknown>;
      return {
        label: typeof api.label === 'string' && api.label.trim() ? api.label : `Active ${i + 1}`,
        targetMgPerTablet: num(api.targetActiveMgPerTablet) ?? 0,
        potencyPercent: potencyPercentOf(api),
      };
    });
  }
  // Runs saved before apis[] existed carried a single active as scalars.
  const mg = num(result.targetActiveMgPerTablet);
  if (mg === null) return [];
  return [
    {
      label: 'Active',
      targetMgPerTablet: mg,
      potencyPercent: potencyPercentOf(result),
    },
  ];
}

/**
 * Fixed-percentage excipients from a past run.
 *
 * Two stored shapes exist and both are real. Runs save their excipients as
 * `inputs.excipients`, a map of ingredient id to a STRING percentage
 * ("pvpp": "10") — that is what the New run page actually writes. Some
 * payloads instead carry a full `inputs.ingredients` array with names on it.
 * Reading only the array shape silently yields no excipients for every run
 * the calculator has ever saved, so both are handled, with names resolved
 * from the id when the shape doesn't carry them.
 *
 * The calculated-by-difference filler is excluded either way: its percentage
 * is an output of the last batch, not an input to the next.
 */
function excipientsOf(
  inputs: Record<string, unknown>,
  result: Record<string, unknown>
): PriorExcipient[] {
  const byId = new Map(defaultIngredients().map((i) => [i.id, i]));

  const ingredients = inputs.ingredients;
  if (Array.isArray(ingredients) && ingredients.length > 0) {
    const out: PriorExcipient[] = [];
    for (const raw of ingredients) {
      const ing = (raw ?? {}) as Record<string, unknown>;
      if (ing.calculatedByDifference === true || ing.role === 'active') continue;
      const name = typeof ing.name === 'string' ? ing.name : byId.get(String(ing.id))?.name;
      const pct = num(ing.percentOfBlend);
      if (!name || pct === null) continue;
      out.push({ name, percentOfBlend: pct });
    }
    return out;
  }

  // The shape the calculator actually writes: id -> string percentage.
  const excipients = inputs.excipients;
  if (excipients && typeof excipients === 'object') {
    const percents = (result.ingredientPercents ?? {}) as Record<string, unknown>;
    const out: PriorExcipient[] = [];
    for (const [id, raw] of Object.entries(excipients as Record<string, unknown>)) {
      const meta = byId.get(id);
      if (!meta || meta.calculatedByDifference || meta.role === 'active') continue;
      // Prefer the computed percentage, which is numeric and is what the run
      // was actually calculated on; the input string is the fallback.
      const pct = num(percents[id]) ?? num(typeof raw === 'string' ? Number(raw) : raw);
      if (pct === null) continue;
      out.push({ name: meta.name, percentOfBlend: pct });
    }
    return out;
  }

  return [];
}

export function summarizePriorRun(run: RunForSummary): PriorRunSummary {
  const result = (run.result ?? {}) as Record<string, unknown>;
  const inputs = (run.inputs ?? {}) as Record<string, unknown>;
  const mode = run.mode === 'regrind' ? 'regrind' : 'fresh';

  return {
    runId: run.id,
    label: run.label,
    product: run.product ?? null,
    createdAt: typeof run.createdAt === 'string' ? run.createdAt : run.createdAt.toISOString(),
    mode,
    outcome: outcomeOf(run),
    tabletWeightG: num(result.targetWeightG),
    tabletCount: num(result.tabletCount),
    actives: activesOf(result),
    fillerName: typeof result.fillerType === 'string' ? result.fillerType : null,
    excipients: excipientsOf(inputs, result),
    actualMgPerTablet: num(run.actualMgPerTablet),
    actualTabletWeight: num(run.actualTabletWeight),
    notes: typeof run.notes === 'string' && run.notes.trim() ? run.notes : null,
  };
}

/** Most recent first — what the suggestion panel shows, newest at the top. */
export function summarizePriorRuns(runs: RunForSummary[]): PriorRunSummary[] {
  return runs
    .map(summarizePriorRun)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Distinct product names across runs, with how many runs each has, for the
 *  product field's suggestion list. */
export function productsFrom(runs: Pick<RunForSummary, 'product'>[]): { product: string; runCount: number }[] {
  const counts = new Map<string, number>();
  for (const run of runs) {
    const p = run.product?.trim();
    if (!p) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([product, runCount]) => ({ product, runCount }))
    .sort((a, b) => a.product.localeCompare(b.product));
}
