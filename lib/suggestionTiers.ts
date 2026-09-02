import { findKnownActiveMatch, knownActiveToSuggestion, type FormulationSuggestion } from './knownActives';

/**
 * The tier split behind the wizard's ingredient suggestions, and the rules for
 * applying one to the draft.
 *
 * Both were previously inline in GuidedFormulationWizard: the tier choice in a
 * render-time ternary, the field merge in a component method. Neither could be
 * tested without a DOM, and this project has no component test setup — every
 * other rule of consequence here (lotSpecStatus, runIngredientBreakdown,
 * productHistory) lives as a pure function in lib/ for exactly that reason.
 * The component now calls these instead of restating them.
 *
 * Nothing here reaches the network. The AI tier's request/parse path stays in
 * lib/activeSuggestion.ts and its API route; this module only decides WHICH
 * tier answers, given a result that has already arrived.
 */

export type SuggestionTier = 'known' | 'ai' | 'none';

export interface ResolvedSuggestion {
  tier: SuggestionTier;
  suggestion: FormulationSuggestion | null;
  /**
   * Whether the AI tier is the one that would have to answer. True only when
   * the static table has no entry — this is what gates showing the "Suggest
   * with AI" control, so a known active never triggers an API call.
   */
  needsAi: boolean;
}

/**
 * Which tier answers for this active.
 *
 * The static table is always consulted first and always wins: it is
 * deterministic, needs no API call, and is the tier an operator can trust
 * without re-checking. The AI result is only consulted when the table has no
 * entry, and even then only if it has already been fetched — this function
 * never decides to call anything.
 */
export function resolveSuggestion(
  activeLabel: string,
  aiResult?: FormulationSuggestion | null
): ResolvedSuggestion {
  const known = findKnownActiveMatch(activeLabel);
  if (known) {
    return { tier: 'known', suggestion: knownActiveToSuggestion(known), needsAi: false };
  }
  if (aiResult) {
    return { tier: 'ai', suggestion: aiResult, needsAi: true };
  }
  return { tier: 'none', suggestion: null, needsAi: true };
}

/** The wizard's shared (non-per-active) fields a suggestion can fill. */
export interface SuggestionTargetFields {
  tabletWeightG: string;
  disintegrantPercent: string;
  lubricantPercent: string;
  glidantName: string;
  glidantPercent: string;
}

export interface AppliedSuggestion {
  /** Always written — these were asked for explicitly for this active. */
  active: { targetMgPerTablet: string; potencyPercent: string };
  /** Shared fields, with anything the operator already filled left untouched. */
  fields: SuggestionTargetFields;
}

/**
 * Conventional glidant paired with a suggested glidant percentage.
 *
 * Suggestions carry a percentage but no glidant NAME: the percentage is
 * standardized across direct-compression practice, the specific product is
 * not. Rather than apply a percentage with no material against it, a blank
 * name is paired with the overwhelmingly conventional choice.
 */
export const DEFAULT_GLIDANT_NAME = 'Silicon Dioxide';

function isBlank(value: string): boolean {
  return value.trim() === '';
}

/**
 * Merges a suggestion into the draft.
 *
 * Two different rules on purpose:
 *  - the active's own dose and potency are overwritten, because asking for a
 *    suggestion for THIS active is a direct request for those two numbers;
 *  - the shared fields are filled only where still blank, because they are not
 *    specific to this active and may already carry the operator's own figures
 *    — silently replacing typed values is how a batch sheet ends up with
 *    numbers nobody chose.
 *
 * Pure: returns the values to write and mutates nothing.
 */
export function applySuggestionToFields(
  current: SuggestionTargetFields,
  suggestion: FormulationSuggestion
): AppliedSuggestion {
  return {
    active: {
      targetMgPerTablet: String(suggestion.targetMgPerTablet),
      potencyPercent: String(suggestion.potencyPercent),
    },
    fields: {
      tabletWeightG: isBlank(current.tabletWeightG)
        ? String(suggestion.tabletWeightG)
        : current.tabletWeightG,
      disintegrantPercent: isBlank(current.disintegrantPercent)
        ? String(suggestion.disintegrantPercent)
        : current.disintegrantPercent,
      lubricantPercent: isBlank(current.lubricantPercent)
        ? String(suggestion.lubricantPercent)
        : current.lubricantPercent,
      glidantName: isBlank(current.glidantName) ? DEFAULT_GLIDANT_NAME : current.glidantName,
      glidantPercent: isBlank(current.glidantPercent)
        ? String(suggestion.glidantPercent)
        : current.glidantPercent,
    },
  };
}
