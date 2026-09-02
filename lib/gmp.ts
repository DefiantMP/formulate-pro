/**
 * GMP mode: the rules that decide what is ENFORCED, kept as pure functions.
 *
 * Everything here answers a yes/no about blocking. Nothing here decides what
 * to display — with GMP mode off the same records render exactly as before,
 * because gating visibility on a settings flag would make the app's history
 * depend on its current configuration, which is the opposite of auditable.
 *
 * Pure and DB-free for the same reason as lib/lotSpecStatus.ts: these are the
 * rules a compliance reviewer will want to read and test in isolation, not
 * rules buried in route handlers.
 */

export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export const REVIEW_STATUSES: readonly ReviewStatus[] = ['pending', 'approved', 'rejected'];
export function isReviewStatus(v: unknown): v is ReviewStatus {
  return typeof v === 'string' && (REVIEW_STATUSES as readonly string[]).includes(v);
}
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Awaiting QC review',
  approved: 'QC approved',
  rejected: 'QC rejected',
};

export type DeviationDisposition = 'pending' | 'accept_with_justification' | 'reject' | 'rework';
export const DEVIATION_DISPOSITIONS: readonly DeviationDisposition[] = [
  'pending',
  'accept_with_justification',
  'reject',
  'rework',
];
export function isDeviationDisposition(v: unknown): v is DeviationDisposition {
  return typeof v === 'string' && (DEVIATION_DISPOSITIONS as readonly string[]).includes(v);
}
export const DEVIATION_DISPOSITION_LABELS: Record<DeviationDisposition, string> = {
  pending: 'Undecided',
  accept_with_justification: 'Accept with justification',
  reject: 'Reject batch',
  rework: 'Rework',
};

export type LotStatusEnforcement = 'warn' | 'block';
export function isLotStatusEnforcement(v: unknown): v is LotStatusEnforcement {
  return v === 'warn' || v === 'block';
}

export interface GmpSettingsShape {
  enabled: boolean;
  lotStatusEnforcement: LotStatusEnforcement;
}

/**
 * Percentage difference from target beyond which a finished batch counts as
 * out of spec and needs a deviation record.
 *
 * Deliberately the SAME 5% the Run History variance display has always used
 * to highlight a result — a figure already shown to operators in red should
 * not silently be a different number from the one that triggers a deviation.
 */
export const DEVIATION_TOLERANCE_PERCENT = 5;

/* ------------------------------------------------------------------ *
 * Grandfathering
 * ------------------------------------------------------------------ */

/**
 * The moment enforcement began: the earliest toggle-log entry that switched
 * GMP mode ON. Null when it has never been on.
 *
 * Derived from the log rather than stored separately so there is exactly one
 * source of truth — a stored "gmpFirstEnabledAt" column could disagree with
 * the log it claims to summarise, and the log is the compliance artifact.
 */
export function gmpFirstEnabledAt(
  log: { newState: boolean; changedAt: Date | string }[]
): Date | null {
  const ons = log
    .filter((e) => e.newState)
    .map((e) => (e.changedAt instanceof Date ? e.changedAt : new Date(e.changedAt)))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (ons.length === 0) return null;
  return ons.reduce((earliest, d) => (d < earliest ? d : earliest));
}

/**
 * Whether a record predates GMP mode ever being switched on.
 *
 * A grandfathered record is NOT non-compliant and must never be flagged as
 * such — it was created under rules that did not exist yet. Retroactively
 * marking historical batches as failures would be both untrue and, for an
 * operator looking at their own history, actively misleading.
 */
export function isGrandfathered(
  createdAt: Date | string,
  firstEnabledAt: Date | null
): boolean {
  if (firstEnabledAt === null) return true;
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return created < firstEnabledAt;
}

/* ------------------------------------------------------------------ *
 * Section 1 — batch review
 * ------------------------------------------------------------------ */

export interface ReviewableRecord {
  createdAt: Date | string;
  reviewStatus?: string | null;
}

/** Whether QC sign-off is outstanding. Only ever true with the mode on, and
 *  never for a record that predates it. */
export function requiresReview(
  record: ReviewableRecord,
  settings: GmpSettingsShape,
  firstEnabledAt: Date | null
): boolean {
  if (!settings.enabled) return false;
  if (isGrandfathered(record.createdAt, firstEnabledAt)) return false;
  return record.reviewStatus !== 'approved';
}

/** A rejection has to say why — an unexplained rejection is not a record. */
export function reviewSubmissionError(
  status: ReviewStatus,
  reviewerName: string,
  notes: string | null | undefined
): string | null {
  if (!reviewerName.trim()) return 'A reviewer name is required.';
  if (status === 'rejected' && !(notes ?? '').trim()) {
    return 'Review notes are required when rejecting.';
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Section 2 — two-person weighing
 * ------------------------------------------------------------------ */

export interface WeighRecord {
  weighedByName?: string | null;
  verifiedByName?: string | null;
}

/**
 * Whether a weighing still needs its second person.
 *
 * The two names must also differ: one person entering their own name twice is
 * not a two-person check, and accepting it would make the control decorative.
 */
export function weighVerificationError(
  record: WeighRecord,
  settings: GmpSettingsShape
): string | null {
  if (!settings.enabled) return null;
  const weighed = (record.weighedByName ?? '').trim();
  const verified = (record.verifiedByName ?? '').trim();
  if (!weighed) return 'GMP mode: record who weighed this component.';
  if (!verified) return 'GMP mode: a second person must verify this weighing.';
  if (weighed.toLowerCase() === verified.toLowerCase()) {
    return 'GMP mode: the verifier must be a different person from the weigher.';
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Section 3 — deviations
 * ------------------------------------------------------------------ */

export interface BatchOutcome {
  targetMgPerTablet?: number | null;
  actualMgPerTablet?: number | null;
  targetTabletWeightG?: number | null;
  actualTabletWeightG?: number | null;
}

export interface OutOfSpecFinding {
  parameter: string;
  target: number;
  actual: number;
  deviationPercent: number;
}

/**
 * Which recorded COA figures fall outside tolerance.
 *
 * Only compares what was actually recorded — a run with no COA entered yet is
 * not out of spec, it is untested, and treating an absent result as a failure
 * is the same mistake as reporting an untested lot as passing.
 */
export function outOfSpecFindings(outcome: BatchOutcome): OutOfSpecFinding[] {
  const checks: { parameter: string; target?: number | null; actual?: number | null }[] = [
    { parameter: 'mg per tablet', target: outcome.targetMgPerTablet, actual: outcome.actualMgPerTablet },
    { parameter: 'tablet weight', target: outcome.targetTabletWeightG, actual: outcome.actualTabletWeightG },
  ];
  const findings: OutOfSpecFinding[] = [];
  for (const c of checks) {
    if (typeof c.target !== 'number' || typeof c.actual !== 'number') continue;
    if (!Number.isFinite(c.target) || !Number.isFinite(c.actual) || c.target <= 0) continue;
    const pct = ((c.actual - c.target) / c.target) * 100;
    if (Math.abs(pct) >= DEVIATION_TOLERANCE_PERCENT) {
      findings.push({ parameter: c.parameter, target: c.target, actual: c.actual, deviationPercent: pct });
    }
  }
  return findings;
}

/** Whether this batch needs a deviation record it does not yet have. */
export function requiresDeviationRecord(
  outcome: BatchOutcome,
  hasDeviation: boolean,
  settings: GmpSettingsShape,
  record: { createdAt: Date | string },
  firstEnabledAt: Date | null
): boolean {
  if (!settings.enabled) return false;
  if (isGrandfathered(record.createdAt, firstEnabledAt)) return false;
  if (hasDeviation) return false;
  return outOfSpecFindings(outcome).length > 0;
}

/** Accepting out-of-spec output requires a stated reason. */
export function deviationSubmissionError(
  disposition: DeviationDisposition,
  justification: string | null | undefined
): string | null {
  if (disposition === 'accept_with_justification' && !(justification ?? '').trim()) {
    return 'A justification is required to accept out-of-spec material.';
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Section 4 — component identity specs
 * ------------------------------------------------------------------ */

export interface MaterialSpecShape {
  spec?: { criteria: { testType: string; retiredAt?: Date | string | null }[] } | null;
}

/**
 * Whether a material has an identity specification on file.
 *
 * "Identity" is a qualitative criterion — you confirm a material IS what the
 * label says, you do not measure it against a numeric range. Retired criteria
 * do not count: a retired spec line is off the current spec, so relying on it
 * would mean releasing material against a specification nobody maintains.
 *
 * Missing identity specs are the single most-cited Part 111 observation, which
 * is why this is the one thing GMP mode blocks NEW usage on.
 */
export function hasIdentitySpec(material: MaterialSpecShape): boolean {
  const criteria = material.spec?.criteria ?? [];
  return criteria.some((c) => c.testType === 'qualitative' && (c.retiredAt ?? null) === null);
}

/** Blocks a material from NEW usage when it has no identity spec. Existing
 *  usage is never revoked — only new consumption is gated. */
export function materialUsageError(
  material: MaterialSpecShape & { name: string },
  settings: GmpSettingsShape
): string | null {
  if (!settings.enabled) return null;
  if (hasIdentitySpec(material)) return null;
  return `GMP mode: ${material.name} has no identity specification on file. Add a qualitative identity criterion to its component spec before using it.`;
}

/* ------------------------------------------------------------------ *
 * Section 5 — consuming a lot whose spec status is not pass
 * ------------------------------------------------------------------ */

export interface LotConsumptionIssue {
  lotLabel: string;
  status: 'fail' | 'pending';
  blocking: boolean;
  message: string;
}

/**
 * What to do about consuming a lot that has not passed QC.
 *
 * The warn/block fork is a setting rather than a hardcoded rule because
 * CLAUDE.md's Open Flags records that either choice would be wrong for half of
 * users. With GMP mode off this returns nothing at all — today's behavior.
 */
export function lotConsumptionIssues(
  lots: { lotLabel: string; specStatus: 'pass' | 'fail' | 'pending' }[],
  settings: GmpSettingsShape
): LotConsumptionIssue[] {
  if (!settings.enabled) return [];
  const blocking = settings.lotStatusEnforcement === 'block';
  return lots
    .filter((l) => l.specStatus !== 'pass')
    .map((l) => ({
      lotLabel: l.lotLabel,
      status: l.specStatus as 'fail' | 'pending',
      blocking,
      message:
        l.specStatus === 'fail'
          ? `Lot ${l.lotLabel} has a failed QC result.`
          : `Lot ${l.lotLabel} has not completed QC testing.`,
    }));
}
