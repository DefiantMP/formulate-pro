/**
 * Unrecognised-excipient tier of the blend rationale panel.
 *
 * lib/knownExcipients.ts explains the 16 materials in the reference table
 * with no API call; anything else — a trade name, a proprietary premix, a
 * house abbreviation — falls through to here. Same two-tier split as
 * lib/knownActives.ts / lib/activeSuggestion.ts, and like those this is
 * advisory prose, not a computed value, so the AI-verification integrity
 * gate in CLAUDE.md does not apply.
 */

export interface ExcipientRationaleReply {
  name: string;
  /** What the material is doing in a tablet blend. */
  purpose: string;
  /** Typical range as % of blend. Null max means "makes up the balance". */
  typicalMinPercent: number | null;
  typicalMaxPercent: number | null;
  /** What tends to go wrong at the wrong level. */
  caution: string;
  /** Said plainly when the model does not recognise the material either. */
  uncertain: boolean;
}

export function buildExcipientRationaleSystemPrompt(): string {
  return `You are helping a nutraceutical/pharmaceutical formulator understand a tablet excipient that is not in their reference table. It may be a trade name, a proprietary premix, or an in-house abbreviation.

Respond with ONLY a single JSON object — no prose, no markdown code fences, no explanation outside the JSON — with exactly these keys:
{
  "purpose": string,              // one or two sentences: what this material does in a tablet blend
  "typicalMinPercent": number|null, // typical low end as % of total blend, or null if it is a filler that makes up the balance or you cannot say
  "typicalMaxPercent": number|null, // typical high end as % of total blend, or null for "makes up the balance" / unknown
  "caution": string,              // one sentence: what tends to go wrong at the wrong level, or handling notes
  "uncertain": boolean            // true if you do not actually recognise this material and are generalising
}

If you do not recognise the material, set "uncertain" to true and say so plainly in "purpose" rather than inventing a specific function. Never guess a precise range you are not confident in — use null. The formulator is relying on this to sanity-check a real batch.`;
}

const isNumOrNull = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isFinite(v));

/**
 * Parses the model reply, tolerating a markdown fence (models add them even
 * when told not to). Returns null on anything that does not cleanly
 * validate — the panel then says it could not explain the material, rather
 * than showing half a profile.
 */
export function parseExcipientRationaleReply(name: string, reply: string): ExcipientRationaleReply | null {
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

  if (typeof p.purpose !== 'string' || !p.purpose.trim()) return null;
  if (typeof p.caution !== 'string') return null;
  if (!isNumOrNull(p.typicalMinPercent) || !isNumOrNull(p.typicalMaxPercent)) return null;

  const min = p.typicalMinPercent;
  const max = p.typicalMaxPercent;
  // A backwards range is a garbled answer, not a usable one.
  if (min !== null && max !== null && min > max) return null;

  return {
    name,
    purpose: p.purpose.trim(),
    typicalMinPercent: min,
    typicalMaxPercent: max,
    caution: p.caution.trim(),
    // Anything but an explicit false is treated as uncertain: a missing flag
    // must not read as confidence.
    uncertain: p.uncertain !== false,
  };
}
