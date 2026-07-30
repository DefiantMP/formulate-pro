import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { defaultIngredients } from './calc-engine';
import type { CalcResult } from './calc-engine/types';
import type { SavedFormulationActive } from './savedFormulations';

const DISINTEGRANT_ID = 'pvpp';
const LUBRICANT_ID = 'magstearate';
// Fresh mode's role:'other' ingredient (EZTAB, fixed 10%) — has no home in
// SavedFormulation's filler/disintegrant/lubricant fields. Folded into
// notes below rather than silently dropped.
const OTHER_ID = 'eztab';

export interface DerivedFormulationFields {
  name: string;
  tabletWeightG: number;
  referenceBatchTablets: number;
  actives: SavedFormulationActive[];
  fillerName: string;
  disintegrantName: string | null;
  disintegrantPercent: number | null;
  lubricantName: string | null;
  lubricantPercent: number | null;
  notes: string | null;
}

/**
 * Maps a Run's computed result onto SavedFormulation's composition fields —
 * pure derivation, no DB access (see syncFormulationFromRun below for the
 * upsert). Fields map directly where the two models share a concept
 * (tablet weight, tablet count, active(s), filler); where they don't, this
 * documents the gap rather than fabricating a number:
 *
 *  - Fresh mode's EZTAB (role 'other', fixed 10% of blend) has no
 *    destination field in SavedFormulation's three-excipient-category model
 *    — its %, if nonzero, is appended to notes instead of being dropped.
 *  - Regrind's disintegrant/lubricant are "already present in the reground
 *    powder, don't add fresh" assumptions — the engine tracks that as a
 *    name only (alreadyPresentIngredientNames) plus a small fresh top-up in
 *    grams (lubricantTopUpG), never a %-of-blend figure. There's nothing
 *    honest to put in disintegrantPercent/lubricantPercent for regrind, so
 *    both are left null rather than guessed.
 *  - Regrind has no per-API breakdown the way Fresh does (combo products);
 *    it maps to a single active entry using the reground powder's own
 *    effectivePotency as the closest analog to "raw material potency" —
 *    the same figure the app's own UI already labels "Reground powder
 *    potency".
 */
export function deriveFormulationFromRun(label: string, mode: 'fresh' | 'regrind', result: CalcResult): DerivedFormulationFields {
  const sourceNote = `Auto-created from Run "${label}".`;

  if (mode === 'fresh' && result.mode === 'fresh') {
    const base = defaultIngredients();
    const disintegrant = base.find((i) => i.id === DISINTEGRANT_ID);
    const lubricant = base.find((i) => i.id === LUBRICANT_ID);
    const other = base.find((i) => i.id === OTHER_ID);
    const otherPercent = other ? result.ingredientPercents[other.id] : undefined;

    const actives: SavedFormulationActive[] = result.apis.map((api) => ({
      label: api.label,
      targetMgPerTablet: api.targetActiveMgPerTablet,
      potencyPercent: api.effectivePotency * 100,
      source: '',
    }));

    return {
      name: label,
      tabletWeightG: result.targetWeightG,
      referenceBatchTablets: result.tabletCount,
      actives,
      fillerName: result.fillerType,
      disintegrantName: disintegrant?.name ?? null,
      disintegrantPercent: disintegrant ? (result.ingredientPercents[disintegrant.id] ?? null) : null,
      lubricantName: lubricant?.name ?? null,
      lubricantPercent: lubricant ? (result.ingredientPercents[lubricant.id] ?? null) : null,
      notes:
        other && otherPercent != null && otherPercent > 0
          ? `${sourceNote} Also includes ${other.name} at ${otherPercent.toFixed(2)}% of blend — not represented in this library's filler/disintegrant/lubricant fields.`
          : sourceNote,
    };
  }

  if (mode === 'regrind' && result.mode === 'regrind') {
    const actives: SavedFormulationActive[] = [
      {
        label: 'Active',
        targetMgPerTablet: result.targetActiveMgPerTablet,
        potencyPercent: result.effectivePotency * 100,
        source: '',
      },
    ];

    return {
      name: label,
      tabletWeightG: result.targetWeightG,
      referenceBatchTablets: result.tabletCount,
      actives,
      fillerName: result.fillerIngredientName,
      disintegrantName: result.alreadyPresentIngredientNames[0] ?? null,
      disintegrantPercent: null,
      lubricantName: result.lubricantTopUpIngredientName,
      lubricantPercent: null,
      notes: `${sourceNote} Regrind disintegrant/lubricant aren't tracked as a %-of-blend by the calculator (only "already present" plus a small fresh top-up) — recorded here by name only.`,
    };
  }

  // mode/result.mode mismatch shouldn't happen in practice (both come from
  // the same Run row), but fail closed with a minimal, honest record rather
  // than throwing and blocking the run save that triggered this.
  return {
    name: label,
    tabletWeightG: 0,
    referenceBatchTablets: 0,
    actives: [],
    fillerName: 'Unknown',
    disintegrantName: null,
    disintegrantPercent: null,
    lubricantName: null,
    lubricantPercent: null,
    notes: `${sourceNote} Could not derive composition (unexpected result shape) — check manually.`,
  };
}

/**
 * Auto-promotion side effect of Run autosave (POST /api/runs and the
 * inputs/result branch of PATCH /api/runs/[id]): keeps one SavedFormulation
 * per Run in sync with that run's current composition, keyed by the new
 * sourceRunId column so repeated autosaves update the same row rather than
 * creating duplicates — the same upsert-by-id pattern Run's own autosave
 * already uses. Run and SavedFormulation stay entirely distinct models;
 * this only writes SavedFormulation's composition fields, never Run's.
 *
 * Deliberately does not touch status/outcomeNotes/equipmentNotes/lineage
 * fields on an existing row — those are the manual-curation side of a
 * Formulation and must survive repeated autosaves untouched.
 *
 * Best-effort: callers should catch/log rather than let a promotion failure
 * fail the run save itself, since the Run row is the primary record.
 */
export async function syncFormulationFromRun(run: { id: string; label: string; mode: string; result: unknown }): Promise<void> {
  if (run.mode !== 'fresh' && run.mode !== 'regrind') return;
  const result = run.result as CalcResult | null | undefined;
  if (!result || (result.mode !== 'fresh' && result.mode !== 'regrind')) return;

  const derived = deriveFormulationFromRun(run.label, run.mode, result);
  const data = {
    name: derived.name,
    tabletWeightG: derived.tabletWeightG,
    referenceBatchTablets: derived.referenceBatchTablets,
    actives: derived.actives as unknown as Prisma.InputJsonValue,
    fillerName: derived.fillerName,
    disintegrantName: derived.disintegrantName,
    disintegrantPercent: derived.disintegrantPercent,
    lubricantName: derived.lubricantName,
    lubricantPercent: derived.lubricantPercent,
    notes: derived.notes,
  };

  const existing = await prisma.savedFormulation.findUnique({ where: { sourceRunId: run.id } });
  if (existing) {
    await prisma.savedFormulation.update({ where: { id: existing.id }, data });
  } else {
    await prisma.savedFormulation.create({ data: { ...data, sourceRunId: run.id } });
  }
}
