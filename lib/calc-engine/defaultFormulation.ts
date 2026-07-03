import type { IngredientLine } from './types';

/**
 * Default formulation, matching the prototype's hardcoded ingredient set.
 * `percentOfBlend` for the active ingredient is null here because it's a
 * per-run input (the "batch potency" field), not a fixed template value —
 * callers supply it at calc time via ingredientOverrides.
 */
export function defaultIngredients(): IngredientLine[] {
  return [
    { id: 'active', name: '7-OH', role: 'active', percentOfBlend: null, calculatedByDifference: false },
    { id: 'emdex', name: 'Emdex', role: 'diluent', percentOfBlend: null, calculatedByDifference: true },
    { id: 'pvpp', name: 'PVPP XL', role: 'disintegrant', percentOfBlend: 5, calculatedByDifference: false },
    { id: 'magstearate', name: 'Magnesium stearate', role: 'lubricant', percentOfBlend: 2, calculatedByDifference: false },
  ];
}
