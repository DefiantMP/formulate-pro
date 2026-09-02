/**
 * A single, editable-not-authoritative starting point for a formulation
 * involving one active ingredient — target mg/tablet, raw material potency,
 * a reasonable tablet weight, and typical excipient percentages. Produced
 * either by an exact match against KNOWN_ACTIVES (source: 'known') or by the
 * AI suggestion endpoint for anything unrecognized (source: 'ai', see
 * lib/activeSuggestion.ts). Both are equally overridable in the UI — this
 * type carries no notion of "applied" or "trusted".
 */
/**
 * Where a reference entry's numbers come from.
 *
 * 'pharmacopeial' entries are general tableting-practice figures for
 * well-documented actives. 'internal' entries are derived from this
 * operator's OWN production history, and carry the number of records behind
 * them — one run is a single data point, not a norm, and the operator has to
 * be able to see the difference before trusting either.
 *
 * The distinction is surfaced in the wizard rather than kept internal: both
 * render under a "reference values" badge, and without it a generic textbook
 * figure is indistinguishable from a figure derived from the operator's own
 * floor.
 */
export type ActiveProvenance =
  | { kind: 'pharmacopeial' }
  | { kind: 'internal'; derivedFromRuns: number };

export interface FormulationSuggestion {
  source: 'known' | 'ai';
  /** Present only on 'known' suggestions — the AI tier has no provenance. */
  provenance?: ActiveProvenance;
  /** The known-table entry's canonical name, or the AI query's own active label. */
  matchedLabel: string;
  targetMgPerTablet: number;
  potencyPercent: number;
  tabletWeightG: number;
  disintegrantPercent: number;
  lubricantPercent: number;
  glidantPercent: number;
  note: string;
}

export interface KnownActiveProfile {
  id: string;
  name: string;
  provenance: ActiveProvenance;
  /**
   * Whether this entry participates in the tier-1 lookup. Omitted means
   * enabled — every shipped entry is live.
   *
   * Set false to park a DRAFTED entry in the table without it reaching
   * operators: findKnownActiveMatch skips it, so the active keeps falling
   * through to the AI tier, which is labelled as unvalidated. That is the
   * safe default for an entry whose figures have not yet been reviewed by
   * someone who can vouch for them — a wrong number under a "reference
   * values" badge is worse than no entry at all.
   *
   * To add an internally-derived entry later: give it
   * `provenance: { kind: 'internal', derivedFromRuns: N }`, set
   * `enabled: false`, have the figures reviewed, then flip to true.
   */
  enabled?: boolean;
  aliases: string[];
  targetMgPerTablet: number;
  potencyPercent: number;
  tabletWeightG: number;
  disintegrantPercent: number;
  lubricantPercent: number;
  glidantPercent: number;
  note: string;
}

/**
 * Deliberately small and curated — a handful of well-documented,
 * pharmacopeial actives where "typical formulation profile" is genuinely
 * standardized, not a comprehensive pharmacopeia. Figures here are general
 * tableting-practice reference points (common labeled dose, typical raw
 * powder potency, conventional direct-compression excipient percentages),
 * not validated production data — confirm against your own raw material COA
 * and product spec before using. Grow this list over time rather than
 * front-loading it.
 */
export const KNOWN_ACTIVES: KnownActiveProfile[] = [
  {
    id: 'acetaminophen',
    name: 'Acetaminophen',
    provenance: { kind: 'pharmacopeial' },
    aliases: ['paracetamol', 'tylenol'],
    targetMgPerTablet: 500,
    potencyPercent: 99,
    tabletWeightG: 0.65,
    disintegrantPercent: 5,
    lubricantPercent: 1,
    glidantPercent: 0.5,
    note: 'Common OTC analgesic dose (325mg and 650mg also common). Acetaminophen compresses poorly on its own and often needs a specialized direct-compression grade or added binder — confirm with your raw material spec.',
  },
  {
    id: 'ibuprofen',
    name: 'Ibuprofen',
    provenance: { kind: 'pharmacopeial' },
    aliases: ['advil', 'motrin'],
    targetMgPerTablet: 200,
    potencyPercent: 99,
    tabletWeightG: 0.4,
    disintegrantPercent: 4,
    lubricantPercent: 1,
    glidantPercent: 0.5,
    note: '200mg is the common OTC strength (400mg is common at prescription strength) — scale target mg/tablet to match your product.',
  },
  {
    id: 'metformin',
    name: 'Metformin HCl',
    provenance: { kind: 'pharmacopeial' },
    aliases: ['metformin', 'metformin hydrochloride'],
    targetMgPerTablet: 500,
    potencyPercent: 99,
    tabletWeightG: 0.7,
    disintegrantPercent: 3,
    lubricantPercent: 1,
    glidantPercent: 0.5,
    note: 'High drug-load active (500-1000mg common); figures shown are for immediate-release — extended-release formulations use different excipients entirely.',
  },
  {
    id: 'aspirin',
    name: 'Aspirin',
    provenance: { kind: 'pharmacopeial' },
    aliases: ['acetylsalicylic acid', 'asa'],
    targetMgPerTablet: 325,
    potencyPercent: 99,
    tabletWeightG: 0.4,
    disintegrantPercent: 4,
    lubricantPercent: 1,
    glidantPercent: 0.5,
    note: '325mg is the common full-strength dose (81mg for low-dose); aspirin is moisture- and heat-sensitive, which can affect excipient and process choice.',
  },
  {
    id: 'ascorbic-acid',
    name: 'Ascorbic acid (Vitamin C)',
    provenance: { kind: 'pharmacopeial' },
    aliases: ['vitamin c'],
    targetMgPerTablet: 500,
    potencyPercent: 99,
    tabletWeightG: 0.65,
    disintegrantPercent: 3,
    lubricantPercent: 1,
    glidantPercent: 0.5,
    note: '500mg and 1000mg are both common strengths. Ascorbic acid is acidic and can be corrosive to tooling over long runs.',
  },
  {
    id: 'calcium-carbonate',
    name: 'Calcium carbonate',
    provenance: { kind: 'pharmacopeial' },
    aliases: ['caco3'],
    targetMgPerTablet: 600,
    potencyPercent: 100,
    tabletWeightG: 0.75,
    disintegrantPercent: 3,
    lubricantPercent: 1.5,
    glidantPercent: 0.5,
    note: 'Figures are for the raw calcium carbonate compound itself, not elemental calcium (~40% of the compound\'s weight) — confirm which your target mg/tablet refers to.',
  },
];

/** Exact match only (case-insensitive, against the canonical name or an alias) — no fuzzy/substring matching, to avoid surprising false positives. */
export function findKnownActiveMatch(label: string): KnownActiveProfile | null {
  const q = label.trim().toLowerCase();
  if (!q) return null;
  return (
    KNOWN_ACTIVES.find(
      (p) =>
        // Drafted-but-unreviewed entries are invisible here by design — see
        // KnownActiveProfile.enabled.
        p.enabled !== false &&
        (p.name.toLowerCase() === q || p.aliases.some((a) => a.toLowerCase() === q))
    ) ?? null
  );
}

export function knownActiveToSuggestion(profile: KnownActiveProfile): FormulationSuggestion {
  return {
    source: 'known',
    provenance: profile.provenance,
    matchedLabel: profile.name,
    targetMgPerTablet: profile.targetMgPerTablet,
    potencyPercent: profile.potencyPercent,
    tabletWeightG: profile.tabletWeightG,
    disintegrantPercent: profile.disintegrantPercent,
    lubricantPercent: profile.lubricantPercent,
    glidantPercent: profile.glidantPercent,
    note: profile.note,
  };
}

/**
 * Badge text for a suggestion, naming where its numbers came from.
 *
 * Kept next to the provenance type so the copy cannot drift from the meaning
 * — the same reason OOS_DISPOSITION_EFFECTS sits beside
 * isInvalidatingInvestigation rather than in a component.
 */
export function suggestionProvenanceLabel(suggestion: FormulationSuggestion): string {
  if (suggestion.source === 'ai') return 'AI-suggested — not validated';
  const p = suggestion.provenance;
  if (p?.kind === 'internal') {
    return p.derivedFromRuns === 1
      ? 'From your history — 1 run only'
      : `From your history — ${p.derivedFromRuns} runs`;
  }
  return 'Reference values — pharmacopeial';
}
