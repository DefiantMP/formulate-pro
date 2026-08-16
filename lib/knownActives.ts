/**
 * A single, editable-not-authoritative starting point for a formulation
 * involving one active ingredient — target mg/tablet, raw material potency,
 * a reasonable tablet weight, and typical excipient percentages. Produced
 * either by an exact match against KNOWN_ACTIVES (source: 'known') or by the
 * AI suggestion endpoint for anything unrecognized (source: 'ai', see
 * lib/activeSuggestion.ts). Both are equally overridable in the UI — this
 * type carries no notion of "applied" or "trusted".
 */
export interface FormulationSuggestion {
  source: 'known' | 'ai';
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
  return KNOWN_ACTIVES.find((p) => p.name.toLowerCase() === q || p.aliases.some((a) => a.toLowerCase() === q)) ?? null;
}

export function knownActiveToSuggestion(profile: KnownActiveProfile): FormulationSuggestion {
  return {
    source: 'known',
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
