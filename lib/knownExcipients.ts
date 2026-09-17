/**
 * Reference profiles for common tableting excipients: what each one is doing
 * in a blend, and what percentage range that job normally calls for.
 *
 * Two consumers:
 *  - the rationale panel, which explains an existing blend without any API
 *    call, so the explanation is always available and always the same;
 *  - the AI excipient-suggestion tier, which is only consulted for materials
 *    this table doesn't recognise (same two-tier split as
 *    lib/knownActives.ts and lib/activeSuggestion.ts).
 *
 * These are general direct-compression practice reference points — common
 * functional ranges from tableting literature and supplier guidance — NOT
 * validated production figures and NOT a substitute for your own product
 * spec. A percentage outside a range here is flagged as unusual, never as
 * wrong: real formulations legitimately sit outside typical ranges for
 * reasons this table cannot know.
 */

export type ExcipientRole =
  | 'filler'
  | 'binder'
  | 'disintegrant'
  | 'lubricant'
  | 'glidant'
  | 'other';

export const EXCIPIENT_ROLE_LABELS: Record<ExcipientRole, string> = {
  filler: 'Filler / diluent',
  binder: 'Binder',
  disintegrant: 'Disintegrant',
  lubricant: 'Lubricant',
  glidant: 'Glidant / flow aid',
  other: 'Other',
};

export interface KnownExcipient {
  id: string;
  name: string;
  /** Lower-cased match targets, including trade names and common spellings. */
  aliases: string[];
  role: ExcipientRole;
  /** Typical functional range as % of total blend. Null max = "makes up the balance". */
  typicalMinPercent: number;
  typicalMaxPercent: number | null;
  /** Why this material is in the blend at all. */
  purpose: string;
  /** Why the typical amount is what it is — the reasoning behind the range. */
  amountRationale: string;
  /** What tends to go wrong at the wrong level. */
  caution: string;
}

export const KNOWN_EXCIPIENTS: KnownExcipient[] = [
  {
    id: 'magnesium-stearate',
    name: 'Magnesium stearate',
    aliases: ['magnesium stearate', 'mag stearate', 'magstear', 'magstearate', 'mg stearate'],
    role: 'lubricant',
    typicalMinPercent: 0.25,
    typicalMaxPercent: 2,
    purpose:
      'Stops the blend sticking to punches and dies, and reduces ejection force so tablets release cleanly.',
    amountRationale:
      'It works by coating particle surfaces, so a very small fraction covers the blend — under about 0.25% coverage is incomplete and sticking returns, while much above 2% there is no further lubrication benefit to gain.',
    caution:
      'Hydrophobic and shear-sensitive: too much, or mixing too long, films the granules and causes capping, lower hardness and slower dissolution. Add last and mix briefly.',
  },
  {
    id: 'stearic-acid',
    name: 'Stearic acid',
    aliases: ['stearic acid'],
    role: 'lubricant',
    typicalMinPercent: 0.5,
    typicalMaxPercent: 3,
    purpose: 'Lubricant for blends where magnesium stearate is incompatible with the active.',
    amountRationale:
      'Less efficient than magnesium stearate per unit weight, so it is used at a somewhat higher percentage for the same lubrication.',
    caution: 'Lower melting point — can soften with press heat on long runs.',
  },
  {
    id: 'sodium-stearyl-fumarate',
    name: 'Sodium stearyl fumarate',
    aliases: ['sodium stearyl fumarate', 'pruv'],
    role: 'lubricant',
    typicalMinPercent: 0.5,
    typicalMaxPercent: 2,
    purpose: 'Hydrophilic lubricant for actives whose dissolution suffers with magnesium stearate.',
    amountRationale:
      'Similar coverage-driven mechanism to magnesium stearate but less hydrophobic, so a slightly higher level is tolerated without the dissolution penalty.',
    caution: 'More expensive; generally reserved for cases where dissolution is a known problem.',
  },
  {
    id: 'silicon-dioxide',
    name: 'Silicon dioxide',
    aliases: [
      'silicon dioxide',
      'silica',
      'colloidal silicon dioxide',
      'colloidal silica',
      'aerosil',
      'cab-o-sil',
      'fumed silica',
    ],
    role: 'glidant',
    typicalMinPercent: 0.1,
    typicalMaxPercent: 1,
    purpose:
      'Improves powder flow into the die so tablet weight stays consistent, and helps break up minor clumping.',
    amountRationale:
      'Extremely fine and high surface area — it works by coating larger particles, so a few tenths of a percent already covers the blend; beyond about 1% it starts to hurt compressibility rather than help flow.',
    caution: 'Too much can reduce tablet hardness and, being very light, is dusty to handle.',
  },
  {
    id: 'talc',
    name: 'Talc',
    aliases: ['talc'],
    role: 'glidant',
    typicalMinPercent: 1,
    typicalMaxPercent: 5,
    purpose: 'Flow aid and anti-adherent, sometimes used alongside a true lubricant.',
    amountRationale:
      'Coarser and much less efficient than colloidal silica, so it needs percent-level inclusion rather than tenths of a percent.',
    caution: 'Can slow disintegration at the top of its range.',
  },
  {
    id: 'crospovidone',
    name: 'Crospovidone (PVPP)',
    aliases: ['crospovidone', 'pvpp', 'pvpp xl', 'polyplasdone', 'kollidon cl'],
    role: 'disintegrant',
    typicalMinPercent: 2,
    typicalMaxPercent: 5,
    purpose:
      'Super-disintegrant — wicks water into the tablet and swells, breaking it apart so the active is released.',
    amountRationale:
      'Highly efficient by capillary action, so a few percent disintegrates a conventional tablet; past roughly 5% the tablet is already breaking as fast as it usefully can and further addition mostly displaces filler.',
    caution: 'Below about 2% disintegration slows noticeably, especially in a dense, high-filler blend.',
  },
  {
    id: 'croscarmellose-sodium',
    name: 'Croscarmellose sodium',
    aliases: ['croscarmellose', 'croscarmellose sodium', 'ac-di-sol'],
    role: 'disintegrant',
    typicalMinPercent: 2,
    typicalMaxPercent: 5,
    purpose: 'Super-disintegrant working mainly by swelling on contact with water.',
    amountRationale:
      'Like crospovidone, efficient enough that a few percent is sufficient; more gives diminishing returns.',
    caution: 'Anionic — can interact with cationic actives.',
  },
  {
    id: 'sodium-starch-glycolate',
    name: 'Sodium starch glycolate',
    aliases: ['sodium starch glycolate', 'ssg', 'explotab', 'primojel'],
    role: 'disintegrant',
    typicalMinPercent: 2,
    typicalMaxPercent: 8,
    purpose: 'Super-disintegrant that swells substantially in water.',
    amountRationale:
      'Swelling-driven rather than wicking-driven, so it tolerates a wider range; the upper end suits denser or more hydrophobic blends.',
    caution: 'At high levels the gel it forms can actually slow release.',
  },
  {
    id: 'mcc',
    name: 'Microcrystalline cellulose',
    aliases: ['microcrystalline cellulose', 'mcc', 'avicel', 'avicel ph-102', 'avicel ph-101'],
    role: 'filler',
    typicalMinPercent: 10,
    typicalMaxPercent: null,
    purpose:
      'Filler and dry binder in one — deforms plastically under compression, which is what gives a direct-compression tablet its hardness.',
    amountRationale:
      'It makes up the bulk of the tablet, so its level is whatever is left after the active and the functional excipients are set. Enough of it has to be present for the tablet to bind at all.',
    caution: 'Hygroscopic; hardness can drift with moisture pickup.',
  },
  {
    id: 'dicalcium-phosphate',
    name: 'Di-Calcium Phosphate',
    aliases: [
      'dicalcium phosphate',
      'di-calcium phosphate',
      'dcp',
      'calcium phosphate dibasic',
      'emcompress',
    ],
    role: 'filler',
    typicalMinPercent: 5,
    typicalMaxPercent: null,
    purpose:
      'Dense, free-flowing inorganic filler. Adds weight and improves flow, and is often blended with a plastic filler for hardness.',
    amountRationale:
      'A bulk component, so the level is set by what the tablet needs to weigh once everything functional is accounted for.',
    caution:
      'Brittle rather than plastic — it fragments instead of binding, so a tablet made mostly of it can be friable without a plastic filler or binder alongside. Abrasive on tooling.',
  },
  {
    id: 'lactose',
    name: 'Lactose',
    aliases: ['lactose', 'lactose monohydrate', 'spray-dried lactose', 'fast flo'],
    role: 'filler',
    typicalMinPercent: 10,
    typicalMaxPercent: null,
    purpose: 'Soluble bulk filler with good flow, widely used in direct compression.',
    amountRationale: 'Bulk component — set by the target tablet weight rather than by a functional level.',
    caution: 'Reducing sugar: browns with primary-amine actives (Maillard). Not for lactose-intolerant markets.',
  },
  {
    id: 'mannitol',
    name: 'Mannitol',
    aliases: ['mannitol', 'pearlitol', 'parteck'],
    role: 'filler',
    typicalMinPercent: 10,
    typicalMaxPercent: null,
    purpose: 'Soluble filler with a cooling mouthfeel — common in chewables and orally disintegrating tablets.',
    amountRationale: 'Bulk component, set by target tablet weight.',
    caution: 'Non-hygroscopic and good for moisture-sensitive actives, but poor compressibility in some grades.',
  },
  {
    id: 'dextrates',
    name: 'Emdex (dextrates)',
    aliases: ['emdex', 'dextrates'],
    role: 'filler',
    typicalMinPercent: 10,
    typicalMaxPercent: null,
    purpose: 'Free-flowing, directly compressible sugar filler with good binding and a sweet taste.',
    amountRationale: 'Bulk component — makes up whatever weight is left once the active and functional excipients are set.',
    caution: 'Hygroscopic; sweetness may be unwanted in some products.',
  },
  {
    id: 'eztab',
    name: 'EZTAB',
    aliases: ['eztab', 'ez tab', 'easytab', 'easy tab'],
    role: 'filler',
    typicalMinPercent: 10,
    typicalMaxPercent: null,
    purpose:
      'Co-processed directly compressible base — a filler that also carries binding and flow properties, used as the bulk of a direct-compression blend.',
    amountRationale:
      'Calculated by difference: it fills whatever weight remains after the active and the fixed excipients are set, so its percentage falls as theirs rise.',
    caution:
      'Because it is calculated by difference, an error in any other percentage shows up silently as a change in this one.',
  },
  {
    id: 'hpmc',
    name: 'HPMC (hypromellose)',
    aliases: ['hpmc', 'hypromellose', 'methocel'],
    role: 'binder',
    typicalMinPercent: 2,
    typicalMaxPercent: 5,
    purpose: 'Binder for granulated blends; at higher levels a sustained-release matrix former.',
    amountRationale:
      'A few percent is enough to bind granules; the level rises well beyond this only when the goal is controlled release rather than binding.',
    caution: 'Above the binding range it will start to retard dissolution — usually not what a plain IR tablet wants.',
  },
  {
    id: 'povidone',
    name: 'Povidone (PVP)',
    aliases: ['povidone', 'pvp', 'pvp k30', 'kollidon'],
    role: 'binder',
    typicalMinPercent: 2,
    typicalMaxPercent: 5,
    purpose: 'Binder that gives granules mechanical strength.',
    amountRationale: 'Effective at low percent levels; more binder means harder tablets but slower disintegration.',
    caution: 'Hygroscopic. Do not confuse with crospovidone (PVPP), which is a disintegrant, not a binder.',
  },
];

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Exact or alias match. Returns null for anything not in the table, which is
 *  the signal for the caller to fall back to the AI tier. */
export function lookupExcipient(name: string): KnownExcipient | null {
  const q = normalise(name);
  if (!q) return null;
  return (
    KNOWN_EXCIPIENTS.find((e) => normalise(e.name) === q || e.aliases.some((a) => normalise(a) === q)) ??
    null
  );
}

export type AmountVerdict = 'typical' | 'below-typical' | 'above-typical' | 'unknown' | 'top-up';

export interface ExcipientAssessment {
  name: string;
  percentOfBlend: number;
  profile: KnownExcipient | null;
  verdict: AmountVerdict;
  /** Plain-language explanation of the verdict, safe to show on its own. */
  message: string;
}

/**
 * Explains one excipient at one level.
 *
 * A verdict is only ever advisory. 'above-typical' means "outside the range
 * this table knows about", not "wrong" — deliberately worded that way,
 * because a formulator has reasons this table cannot see, and a tool that
 * says "wrong" about a legitimate formulation trains people to ignore it.
 */
/** Two decimals at most, trailing zeros dropped: 71.61825631686773 -> "71.62",
 *  5 -> "5". The raw figure stays on the assessment for callers that want it. */
function pct(n: number): string {
  return String(parseFloat(n.toFixed(2)));
}

export function assessExcipient(name: string, percentOfBlend: number): ExcipientAssessment {
  const profile = lookupExcipient(name);
  if (!profile) {
    return {
      name,
      percentOfBlend,
      profile: null,
      verdict: 'unknown',
      message: `Not in the reference table, so there is no typical range to compare ${pct(percentOfBlend)}% against.`,
    };
  }

  const { typicalMinPercent: min, typicalMaxPercent: max } = profile;
  const range = max === null ? `${min}% or more` : `${min}–${max}%`;

  if (percentOfBlend < min) {
    return {
      name,
      percentOfBlend,
      profile,
      verdict: 'below-typical',
      message: `${pct(percentOfBlend)}% is below the usual ${range} for a ${EXCIPIENT_ROLE_LABELS[profile.role].toLowerCase()}. ${profile.caution}`,
    };
  }
  if (max !== null && percentOfBlend > max) {
    return {
      name,
      percentOfBlend,
      profile,
      verdict: 'above-typical',
      message: `${pct(percentOfBlend)}% is above the usual ${range}. ${profile.caution}`,
    };
  }
  return {
    name,
    percentOfBlend,
    profile,
    verdict: 'typical',
    message: `${pct(percentOfBlend)}% sits within the usual ${range}. ${profile.amountRationale}`,
  };
}

/* ------------------------------------------------------------------------
 * Blend-level rationale — the panel under the New run output.
 * ---------------------------------------------------------------------- */

export interface BlendItem {
  name: string;
  percentOfBlend: number;
  /** Actives are listed for context but never assessed: their level comes
   *  from the dose, not from a typical excipient range. */
  isActive?: boolean;
  /**
   * A small fresh addition on top of what the blend already contains — the
   * regrind lubricant top-up. Comparing it against a full formulation's
   * typical range would call a correct 0.15% "below typical", so it is
   * explained instead of assessed.
   */
  freshTopUp?: boolean;
}

export interface BlendRationaleOptions {
  /**
   * Roles already filled by material carried into the blend rather than
   * weighed out — in regrind, the disintegrant and lubricant already in the
   * reground powder. Never reported as gaps: the job is being done, just not
   * by a line on the weigh sheet.
   */
  rolesCarriedIn?: ExcipientRole[];
}

export interface BlendGap {
  role: ExcipientRole;
  message: string;
}

export interface BlendRationale {
  /** One per excipient, in the order given. Actives are excluded. */
  items: ExcipientAssessment[];
  /** Jobs nothing in the blend is doing. Advisory — a formulation can be
   *  fine without them (a fast-dissolving blend may need no disintegrant). */
  gaps: BlendGap[];
  /** Excipients absent from the table, for the AI tier to explain. */
  unknownNames: string[];
}

/** Roles worth pointing out when nothing in the blend fills them. Glidant is
 *  deliberately absent: plenty of blends flow fine without one, so flagging
 *  it would be noise on most runs. */
const EXPECTED_ROLES: { role: ExcipientRole; message: string }[] = [
  {
    role: 'lubricant',
    message:
      'Nothing in this blend is lubricating it. Without a lubricant the blend tends to stick to the punches and dies, and tablets are harder to eject. Deliberate for some direct-compression blends with self-lubricating fillers — worth confirming.',
  },
  {
    role: 'disintegrant',
    message:
      'Nothing in this blend is acting as a disintegrant, so the tablet relies on the filler alone to break up. Fine for a chewable or a slowly-released product, and worth confirming otherwise.',
  },
];

/**
 * Explains a whole blend: what each excipient is doing, whether its level is
 * typical, and which jobs nothing is doing.
 *
 * Ingredients at 0% are dropped — they are not in the blend, and explaining
 * the purpose of something nobody is weighing out reads as an instruction to
 * add it (the same reasoning that keeps 0 g lines out of the SOP).
 */
export function buildBlendRationale(
  items: BlendItem[],
  options: BlendRationaleOptions = {}
): BlendRationale {
  const excipients = items.filter((i) => !i.isActive && i.percentOfBlend > 0 && i.name.trim() !== '');
  const assessments = excipients.map((i) => {
    const assessment = assessExcipient(i.name.trim(), i.percentOfBlend);
    if (!i.freshTopUp || !assessment.profile) return assessment;
    return {
      ...assessment,
      verdict: 'top-up' as const,
      message: `${pct(i.percentOfBlend)}% is a fresh top-up, not the whole amount in the blend — most of it is already present in the material being reworked, so this is not comparable with the usual range.`,
    };
  });
  const rolesPresent = new Set([
    ...assessments.map((a) => a.profile?.role).filter((r): r is ExcipientRole => !!r),
    ...(options.rolesCarriedIn ?? []),
  ]);

  return {
    items: assessments,
    // Only claimed when every excipient was recognised: an unrecognised
    // material may well be the missing lubricant, and "you have no lubricant"
    // next to a material the table simply does not know is worse than silence.
    gaps: assessments.every((a) => a.profile)
      ? EXPECTED_ROLES.filter((r) => !rolesPresent.has(r.role))
      : [],
    unknownNames: assessments.filter((a) => !a.profile).map((a) => a.name),
  };
}
