/**
 * Rolls a lot's individual spec-test results up into one overall QC verdict.
 *
 * Pure functions over plain shapes (not Prisma model types) so this is
 * testable without a database and reusable from both API routes and UI —
 * same pattern as lib/runIngredientBreakdown.ts.
 */

export type LotSpecStatus = 'pass' | 'fail' | 'pending';

export type OosDisposition =
  | 'pending'
  | 'invalidate_original_result'
  | 'confirm_original_result'
  | 'reject_lot';

/** The closed set behind OosDisposition, for validating writes. */
export const OOS_DISPOSITIONS: readonly OosDisposition[] = [
  'pending',
  'invalidate_original_result',
  'confirm_original_result',
  'reject_lot',
];

export function isOosDisposition(value: unknown): value is OosDisposition {
  return typeof value === 'string' && (OOS_DISPOSITIONS as readonly string[]).includes(value);
}

/** Display labels, kept next to the closed set so a new member can't be added
 *  without a label being obviously missing. */
export const OOS_DISPOSITION_LABELS: Record<OosDisposition, string> = {
  pending: 'Undecided',
  invalidate_original_result: 'Invalidate original result',
  confirm_original_result: 'Confirm original result',
  reject_lot: 'Reject lot',
};

/**
 * What each disposition does to the failure once the investigation is
 * approved — the thing an operator cannot infer from the label alone, and
 * the reason this lives here rather than being written out in a component:
 * these strings have to track isInvalidatingInvestigation below, and a UI
 * that describes the effect wrongly is worse than one that says nothing.
 */
export const OOS_DISPOSITION_EFFECTS: Record<OosDisposition, string> = {
  pending: 'No effect. An investigation must reach a disposition before it can be approved.',
  invalidate_original_result:
    'Sets the original failing result aside. This is the only disposition that can clear a failure — and only once approved. The criterion still needs an affirmative passing result afterwards to reach pass; on its own this leaves it pending.',
  confirm_original_result:
    'The failure stands. The lot stays failed.',
  reject_lot:
    'The failure stands and the lot is rejected. The lot stays failed.',
};

export interface SpecCriterionInput {
  id: string;
  testType: string;
  minValue?: number | null;
  maxValue?: number | null;
}

export interface OosInvestigationInput {
  disposition: string;
  approvedBy?: string | null;
  approvedAt?: Date | null;
}

export interface LotSpecTestInput {
  id: string;
  specCriterionId: string;
  passFail: boolean;
  testedAt: Date;
  createdAt?: Date;
  /**
   * Investigations opened against this test — the Prisma back-relation, so
   * a lot loaded with lotSpecStatusInclude can be passed straight in.
   */
  oosInvestigations?: OosInvestigationInput[];
}

/**
 * Deterministic pass/fail for a numeric_range criterion. Returns null when
 * the criterion can't be evaluated at all — no bounds at all, or no numeric
 * result recorded — which the caller must treat as "not yet answered"
 * (pending) rather than as a pass.
 *
 * Bounds are inclusive, and one-sided limits are supported: a heavy-metals
 * criterion typically has only a maxValue.
 */
export function evaluateNumericResult(
  criterion: Pick<SpecCriterionInput, 'minValue' | 'maxValue'>,
  resultValue: number | null | undefined
): boolean | null {
  if (resultValue == null || !Number.isFinite(resultValue)) return null;
  const { minValue, maxValue } = criterion;
  if (minValue == null && maxValue == null) return null;
  if (minValue != null && resultValue < minValue) return false;
  if (maxValue != null && resultValue > maxValue) return false;
  return true;
}

/**
 * Whether an OOS investigation actually sets its failing result aside.
 *
 * Requires BOTH halves: an approval (approvedBy and approvedAt — an
 * investigation is only closed once approved) and a disposition of
 * 'invalidate_original_result'. A disposition of 'confirm_original_result'
 * or 'reject_lot' never invalidates anything, and an unapproved
 * investigation carries no weight no matter what it concludes — including
 * one already marked invalidate_original_result but still awaiting sign-off.
 */
export function isInvalidatingInvestigation(investigation: OosInvestigationInput): boolean {
  return (
    investigation.disposition === 'invalidate_original_result' &&
    investigation.approvedBy != null &&
    investigation.approvedAt != null
  );
}

/**
 * Whether a given failed test has been set aside. Asks whether *any*
 * investigation on it qualifies, so an earlier investigation closed as
 * confirm_original_result doesn't block a later, properly approved
 * invalidating one.
 */
export function isFailureInvalidated(test: LotSpecTestInput): boolean {
  return (test.oosInvestigations ?? []).some(isInvalidatingInvestigation);
}

/**
 * Status of a single criterion, given every test recorded against it.
 *
 * A failure is sticky. Once any test for a criterion has passFail = false,
 * the criterion stays 'fail' — a later passing retest does NOT silently
 * supersede it. The only way past a failure is an approved OOS investigation
 * concluding invalidate_original_result (see isInvalidatingInvestigation);
 * only then is that result excluded and the latest remaining test allowed to
 * decide.
 *
 * This is the deliberate inversion of "most recent test wins": retesting
 * until you like the answer is exactly the practice the OOS record exists to
 * prevent, so the burden is on the investigation, not on recency.
 */
export function resolveCriterionStatus(tests: LotSpecTestInput[]): LotSpecStatus {
  // A standing failure outranks everything, including any later pass.
  if (tests.some((t) => !t.passFail && !isFailureInvalidated(t))) return 'fail';

  // No failure still stands, so every remaining result is a pass. One is
  // enough; recency is irrelevant once nothing is left to override.
  return tests.some((t) => t.passFail) ? 'pass' : 'pending';
}

/**
 * Collapses a lot's test history down to one effective test per criterion:
 * the most recent by testedAt, tie-broken by createdAt, then by input order
 * (later wins).
 *
 * Exported for display — "the current result for this parameter" — NOT for
 * deciding status. resolveCriterionStatus deliberately looks at the whole
 * history rather than just the newest row, so recency can't bury a failure.
 */
export function resolveLatestTests<T extends LotSpecTestInput>(tests: T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const test of tests) {
    const current = latest.get(test.specCriterionId);
    if (!current || !isOlderThan(test, current)) latest.set(test.specCriterionId, test);
  }
  return latest;
}

function isOlderThan(a: LotSpecTestInput, b: LotSpecTestInput): boolean {
  const aTested = a.testedAt.getTime();
  const bTested = b.testedAt.getTime();
  if (aTested !== bTested) return aTested < bTested;
  const aCreated = a.createdAt?.getTime() ?? aTested;
  const bCreated = b.createdAt?.getTime() ?? bTested;
  return aCreated < bCreated;
}

/**
 * A lot's overall spec status:
 *
 * - 'fail'    — any criterion failed, per resolveCriterionStatus's sticky
 *               rule. Checked first, so one out-of-spec parameter condemns
 *               the lot even if others are still untested.
 * - 'pass'    — every criterion on the material's spec resolves to pass.
 * - 'pending' — anything else: some criterion untested, or there is no spec
 *               (or an empty one) to test against.
 *
 * The no-spec / zero-criteria case is deliberately 'pending', not 'pass'.
 * "Every criterion passed" is vacuously true for an empty spec, and quietly
 * reporting a never-tested lot as released is exactly the failure mode this
 * table exists to prevent.
 */
export function computeLotSpecStatus(
  criteria: SpecCriterionInput[],
  tests: LotSpecTestInput[]
): LotSpecStatus {
  const byCriterion = new Map<string, LotSpecTestInput[]>();
  for (const test of tests) {
    const bucket = byCriterion.get(test.specCriterionId);
    if (bucket) bucket.push(test);
    else byCriterion.set(test.specCriterionId, [test]);
  }

  // Tests for a criterion that's since been removed from the spec are
  // ignored for status (the row itself is never deleted — it stays in the
  // DB as part of the lot's testing record).
  const statuses = criteria.map((c) => resolveCriterionStatus(byCriterion.get(c.id) ?? []));
  if (statuses.includes('fail')) return 'fail';
  if (criteria.length === 0) return 'pending';
  if (statuses.every((s) => s === 'pass')) return 'pass';
  return 'pending';
}

/** Per-criterion breakdown behind a lot's overall status — for showing an
 *  operator *which* parameter is holding a lot at fail or pending. */
export function computeCriterionStatuses(
  criteria: SpecCriterionInput[],
  tests: LotSpecTestInput[]
): { criterionId: string; status: LotSpecStatus }[] {
  return criteria.map((c) => ({
    criterionId: c.id,
    status: resolveCriterionStatus(tests.filter((t) => t.specCriterionId === c.id)),
  }));
}

/** Shape of a lot loaded with its material's spec criteria and its own tests. */
export interface LotWithSpecTests {
  rawMaterial: { spec: { criteria: SpecCriterionInput[] } | null };
  specTests: LotSpecTestInput[];
}

/** computeLotSpecStatus over a lot loaded straight from Prisma with the
 *  lotSpecStatusInclude relations included. */
export function lotSpecStatus(lot: LotWithSpecTests): LotSpecStatus {
  return computeLotSpecStatus(lot.rawMaterial.spec?.criteria ?? [], lot.specTests);
}

/**
 * The `include` a Prisma lot query needs for lotSpecStatus() to work.
 *
 * Two things here are load-bearing, not incidental:
 *  - oosInvestigations must be included with the tests — without it every
 *    failure looks un-invalidated and a legitimately cleared lot reads as
 *    'fail'.
 *  - criteria must be filtered to retiredAt: null. A retired criterion is no
 *    longer part of the spec, so it must not hold a lot at pending (never
 *    tested) or fail (failed before it was retired).
 */
export const lotSpecStatusInclude = {
  rawMaterial: {
    include: { spec: { include: { criteria: { where: { retiredAt: null } } } } },
  },
  specTests: { include: { oosInvestigations: true } },
} as const;
