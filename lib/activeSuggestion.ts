import type { FormulationSuggestion } from './knownActives';

export type { FormulationSuggestion };

const REQUIRED_NUMERIC_KEYS = [
  'targetMgPerTablet',
  'potencyPercent',
  'tabletWeightG',
  'disintegrantPercent',
  'lubricantPercent',
  'glidantPercent',
] as const;

/**
 * System prompt for the "unrecognized active" tier of formulation
 * suggestions (lib/knownActives.ts covers the known/pharmacopeial tier with
 * no API call). Plain single-turn text generation via lib/chat.ts's
 * runChatTurn, same as the troubleshooting chat — this is a qualitative
 * starting-point suggestion, not a computed/verified number, so CLAUDE.md's
 * AI-verification integrity gate doesn't apply here either.
 */
export function buildActiveSuggestionSystemPrompt(): string {
  return `You are helping a nutraceutical/pharmaceutical formulator draft a STARTING POINT for a tablet formulation involving an active ingredient they gave you, which may be proprietary or otherwise undocumented in standard references.

Respond with ONLY a single JSON object — no prose, no markdown code fences, no explanation outside the JSON — with exactly these keys:
{
  "targetMgPerTablet": number,   // a common/typical dose for this active, in mg per tablet
  "potencyPercent": number,      // typical raw-material potency (0-100) for this active's usual commercial powder form
  "tabletWeightG": number,       // a reasonable target total tablet weight in grams for that dose
  "disintegrantPercent": number, // typical disintegrant % of blend for a direct-compression tablet
  "lubricantPercent": number,    // typical lubricant % of blend
  "glidantPercent": number,      // typical glidant % of blend
  "note": string                 // one short sentence flagging any special formulation consideration for this active, or plainly caveating that this is a generic estimate
}

If you don't have reliable typical figures for this specific active, still return your best general estimate using standard tableting conventions, and say so plainly in "note" — never omit a field or return a non-numeric value for a numeric field.`;
}

/**
 * Parses the model's reply into a FormulationSuggestion, tolerating a
 * markdown code fence around the JSON (models do this even when told not
 * to). Returns null on anything that doesn't cleanly validate — callers
 * surface that as "couldn't get a suggestion, try again" rather than
 * showing partial/garbled data.
 */
export function parseActiveSuggestionReply(activeLabel: string, reply: string): FormulationSuggestion | null {
  const cleaned = reply
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;

  for (const key of REQUIRED_NUMERIC_KEYS) {
    if (typeof p[key] !== 'number' || !Number.isFinite(p[key] as number)) return null;
  }
  if (typeof p.note !== 'string') return null;

  return {
    source: 'ai',
    matchedLabel: activeLabel,
    targetMgPerTablet: p.targetMgPerTablet as number,
    potencyPercent: p.potencyPercent as number,
    tabletWeightG: p.tabletWeightG as number,
    disintegrantPercent: p.disintegrantPercent as number,
    lubricantPercent: p.lubricantPercent as number,
    glidantPercent: p.glidantPercent as number,
    note: p.note as string,
  };
}
