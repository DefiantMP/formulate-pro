/**
 * Closed sets and write-validation helpers for the raw material / lot /
 * component spec system.
 *
 * These live here rather than in the route files so the same vocabulary is
 * enforced everywhere (and can be reused by a future UI), and here rather
 * than in the Prisma schema because SQLite has no enum support — the schema
 * stores them as plain strings, so the constraint has to be applied in code.
 */

export type RawMaterialCategory =
  | 'active'
  | 'filler'
  | 'lubricant'
  | 'glidant'
  | 'disintegrant'
  | 'other';

export const RAW_MATERIAL_CATEGORIES: readonly RawMaterialCategory[] = [
  'active',
  'filler',
  'lubricant',
  'glidant',
  'disintegrant',
  'other',
];

export function isRawMaterialCategory(value: unknown): value is RawMaterialCategory {
  return typeof value === 'string' && (RAW_MATERIAL_CATEGORIES as readonly string[]).includes(value);
}

/** Display labels. Kept next to the closed sets so a new member can't be
 *  added without a label being obviously missing. */
export const RAW_MATERIAL_CATEGORY_LABELS: Record<RawMaterialCategory, string> = {
  active: 'Active',
  filler: 'Filler',
  lubricant: 'Lubricant',
  glidant: 'Glidant',
  disintegrant: 'Disintegrant',
  other: 'Other',
};

/**
 * 'regroundTablets' and 'rawPowder' align exactly with RegrindLotSourceType
 * in lib/calc-engine/types.ts; 'purchased' is additional here and has no
 * calc-engine meaning.
 */
export type LotSourceType = 'regroundTablets' | 'rawPowder' | 'purchased';

export const LOT_SOURCE_TYPES: readonly LotSourceType[] = [
  'regroundTablets',
  'rawPowder',
  'purchased',
];

export function isLotSourceType(value: unknown): value is LotSourceType {
  return typeof value === 'string' && (LOT_SOURCE_TYPES as readonly string[]).includes(value);
}

export const LOT_SOURCE_TYPE_LABELS: Record<LotSourceType, string> = {
  regroundTablets: 'Reground tablets',
  rawPowder: 'Raw powder',
  purchased: 'Purchased',
};

export type SpecTestType = 'numeric_range' | 'qualitative';

export const SPEC_TEST_TYPES: readonly SpecTestType[] = ['numeric_range', 'qualitative'];

export function isSpecTestType(value: unknown): value is SpecTestType {
  return typeof value === 'string' && (SPEC_TEST_TYPES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------------
 * Client-facing record shapes — what the API actually returns over JSON.
 * Dates arrive as ISO strings, not Date objects; anything feeding
 * lib/lotSpecStatus.ts (which compares testedAt/createdAt as Dates) has to
 * convert first — see toSpecTestInputs below.
 * ---------------------------------------------------------------------- */

export interface RawMaterialListItem {
  id: string;
  name: string;
  category: string;
  createdAt: string;
  spec: { id: string; name: string } | null;
  _count: { lots: number };
}

export interface SpecCriterionRecord {
  id: string;
  componentSpecId: string;
  parameterName: string;
  testType: string;
  minValue: number | null;
  maxValue: number | null;
  targetValue: number | null;
  passCriteriaText: string | null;
  retiredAt: string | null;
  createdAt: string;
}

export interface ComponentSpecRecord {
  id: string;
  rawMaterialId: string;
  name: string;
  createdAt: string;
  criteria: SpecCriterionRecord[];
}

export interface RawMaterialDetail {
  id: string;
  name: string;
  category: string;
  createdAt: string;
  spec: ComponentSpecRecord | null;
  /** Returned separately from spec.criteria, which holds only active ones. */
  retiredCriteria: SpecCriterionRecord[];
}

export interface LotListItem {
  id: string;
  rawMaterialId: string;
  lotLabel: string;
  receivedDate: string;
  quantityReceivedG: number;
  quantityRemainingG: number;
  sourceType: string;
  supplier: string | null;
  notes: string | null;
  createdAt: string;
  rawMaterial?: { id: string; name: string; category: string };
}

export interface OosInvestigationRecord {
  id: string;
  lotId: string;
  failedLotSpecTestId: string;
  openedBy: string;
  openedAt: string;
  reasonForInvestigation: string;
  rootCauseFindings: string | null;
  retestJustified: boolean | null;
  disposition: string;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface LotSpecTestRecord {
  id: string;
  lotId: string;
  specCriterionId: string;
  resultValue: number | null;
  resultText: string | null;
  passFail: boolean;
  methodUsed: string | null;
  testedBy: string | null;
  testedAt: string;
  notes: string | null;
  createdAt: string;
  oosInvestigations: OosInvestigationRecord[];
  specCriterion: SpecCriterionRecord;
}

export interface LotDetailRecord extends LotListItem {
  rawMaterial: {
    id: string;
    name: string;
    category: string;
    spec: { id: string; name: string; criteria: SpecCriterionRecord[] } | null;
  };
  specTests: LotSpecTestRecord[];
  /** THE lot-level verdict — computed by the rollup server-side. This is the
   *  only thing any UI may render as a lot's pass/fail. */
  specStatus: 'pass' | 'fail' | 'pending';
  criterionStatuses: { criterionId: string; status: 'pass' | 'fail' | 'pending' }[];
}

/**
 * Converts API test records into the shape lib/lotSpecStatus.ts helpers
 * expect, parsing the ISO date strings back into Dates. Without this,
 * resolveLatestTests throws on testedAt.getTime().
 *
 * The nested oosInvestigations are converted too. isInvalidatingInvestigation
 * only null-checks approvedAt, so leaving it a string would happen to behave
 * correctly today — which is exactly why it's converted here rather than left
 * to chance: any future rule that actually reads that timestamp (an approval
 * cut-off, an ordering) would otherwise silently compare a string.
 */
export function toSpecTestInputs(tests: LotSpecTestRecord[]) {
  return tests.map((t) => ({
    ...t,
    testedAt: new Date(t.testedAt),
    createdAt: new Date(t.createdAt),
    oosInvestigations: t.oosInvestigations.map((i) => ({
      ...i,
      approvedAt: i.approvedAt === null ? null : new Date(i.approvedAt),
    })),
  }));
}

/** A criterion as submitted to PUT /api/raw-materials/[id]/spec. */
export interface SpecCriterionPayload {
  /** Present for an existing criterion being edited; absent to create one. */
  id?: string;
  parameterName: string;
  testType: SpecTestType;
  minValue: number | null;
  maxValue: number | null;
  targetValue: number | null;
  passCriteriaText: string | null;
}

function isOptionalNumber(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Validates and normalizes one criterion from a spec write.
 *
 * Returns either the cleaned payload or a human-readable error. Normalizing
 * matters as much as validating: a qualitative criterion's numeric bounds are
 * forced to null (and vice versa) so a criterion edited from one testType to
 * the other can't keep stale fields that would then be silently ignored — or
 * worse, quietly used.
 */
export function parseSpecCriterion(
  raw: unknown,
  index: number
): { ok: true; value: SpecCriterionPayload } | { ok: false; error: string } {
  const at = `criteria[${index}]`;
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: `${at} must be an object` };
  }
  const c = raw as Record<string, unknown>;

  if (c.id !== undefined && (typeof c.id !== 'string' || !c.id.trim())) {
    return { ok: false, error: `${at}.id must be a non-empty string when present` };
  }
  if (typeof c.parameterName !== 'string' || !c.parameterName.trim()) {
    return { ok: false, error: `${at}.parameterName is required` };
  }
  if (!isSpecTestType(c.testType)) {
    return { ok: false, error: `${at}.testType must be one of ${SPEC_TEST_TYPES.join(', ')}` };
  }
  for (const field of ['minValue', 'maxValue', 'targetValue'] as const) {
    if (!isOptionalNumber(c[field])) {
      return { ok: false, error: `${at}.${field} must be a number or null` };
    }
  }
  if (
    c.passCriteriaText !== null &&
    c.passCriteriaText !== undefined &&
    typeof c.passCriteriaText !== 'string'
  ) {
    return { ok: false, error: `${at}.passCriteriaText must be a string or null` };
  }

  const minValue = (c.minValue as number | null | undefined) ?? null;
  const maxValue = (c.maxValue as number | null | undefined) ?? null;

  if (c.testType === 'numeric_range') {
    // A numeric criterion with no bounds can never be evaluated —
    // evaluateNumericResult returns null for it, so every lot would sit at
    // pending forever with no way to tell why. Reject at write time rather
    // than let an un-passable spec into the DB.
    if (minValue === null && maxValue === null) {
      return { ok: false, error: `${at} needs at least one of minValue or maxValue` };
    }
    if (minValue !== null && maxValue !== null && minValue > maxValue) {
      return { ok: false, error: `${at}.minValue cannot exceed maxValue` };
    }
    return {
      ok: true,
      value: {
        id: c.id as string | undefined,
        parameterName: c.parameterName.trim(),
        testType: 'numeric_range',
        minValue,
        maxValue,
        targetValue: (c.targetValue as number | null | undefined) ?? null,
        // Meaningless on a numeric criterion — dropped rather than stored.
        passCriteriaText: null,
      },
    };
  }

  return {
    ok: true,
    value: {
      id: c.id as string | undefined,
      parameterName: c.parameterName.trim(),
      testType: 'qualitative',
      // Numeric bounds are meaningless here — dropped rather than stored,
      // so they can't be mistaken for an active constraint.
      minValue: null,
      maxValue: null,
      targetValue: null,
      passCriteriaText: ((c.passCriteriaText as string | null | undefined) ?? null) || null,
    },
  };
}
