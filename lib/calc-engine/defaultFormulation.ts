import type { IngredientLine } from './types';

/**
 * Default formulation, matching the prototype's hardcoded ingredient set.
 * `percentOfBlend` for the active ingredient is null here because it's a
 * per-run input (the "batch potency" field), not a fixed template value —
 * callers supply it at calc time via ingredientOverrides.
 */
export function defaultIngredients(): IngredientLine[] {
  return [
    { id: 'active', name: 'API', role: 'active', percentOfBlend: null, calculatedByDifference: false },
    { id: 'emdex', name: 'Emdex', role: 'diluent', percentOfBlend: null, calculatedByDifference: true },
    { id: 'pvpp', name: 'PVPP XL', role: 'disintegrant', percentOfBlend: 5, calculatedByDifference: false },
    { id: 'magstearate', name: 'Magnesium stearate', role: 'lubricant', percentOfBlend: 2, calculatedByDifference: false },
    { id: 'eztab', name: 'EZTAB', role: 'other', percentOfBlend: 10, calculatedByDifference: false },
    // Glidant, added after fresh-batch actives/filler/disintegrant/lubricant
    // were already established — 0% by default (not every blend uses one),
    // same "optional, allow 0%" treatment as SavedFormulation's glidant
    // field. Note this default percentOfBlend isn't actually read by the
    // live New Run UI (FormulateApp seeds excipientPercents blank
    // regardless — see its own comment), only by tests/presets that build
    // straight off defaultIngredients().
    { id: 'silicondioxide', name: 'Silicon Dioxide', role: 'glidant', percentOfBlend: 0, calculatedByDifference: false },
  ];
}
