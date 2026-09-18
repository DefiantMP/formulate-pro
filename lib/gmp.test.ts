import { describe, it, expect } from 'vitest';
import {
  DEVIATION_TOLERANCE_PERCENT,
  deviationSubmissionError,
  gmpFirstEnabledAt,
  hasIdentitySpec,
  isGrandfathered,
  lotConsumptionIssues,
  materialUsageError,
  outOfSpecFindings,
  requiresDeviationRecord,
  requiresReview,
  reviewSubmissionError,
  weighVerificationError,
  type GmpSettingsShape,
  gmpActorLabel,
  oosApprovalError,
  selfReviewError,
  approvedRunEditError,
} from './gmp';

const OFF: GmpSettingsShape = { enabled: false, lotStatusEnforcement: 'warn' };
const ON: GmpSettingsShape = { enabled: true, lotStatusEnforcement: 'warn' };
const ON_BLOCK: GmpSettingsShape = { enabled: true, lotStatusEnforcement: 'block' };

const T0 = new Date('2026-01-01T00:00:00Z'); // before mode ever on
const ENABLED_AT = new Date('2026-06-01T00:00:00Z');
const T1 = new Date('2026-07-01T00:00:00Z'); // after

describe('toggle log — when enforcement began', () => {
  it('is null until the mode has ever been switched on', () => {
    expect(gmpFirstEnabledAt([])).toBeNull();
    expect(gmpFirstEnabledAt([{ newState: false, changedAt: T1 }])).toBeNull();
  });

  it('is the EARLIEST on-event, not the latest', () => {
    // Toggling off and on again must not move the grandfathering boundary
    // forward — that would retroactively expose already-compliant records.
    const log = [
      { newState: true, changedAt: ENABLED_AT },
      { newState: false, changedAt: T1 },
      { newState: true, changedAt: new Date('2026-08-01T00:00:00Z') },
    ];
    expect(gmpFirstEnabledAt(log)?.toISOString()).toBe(ENABLED_AT.toISOString());
  });

  it('accepts ISO strings as they arrive over JSON', () => {
    expect(gmpFirstEnabledAt([{ newState: true, changedAt: ENABLED_AT.toISOString() }])?.getTime())
      .toBe(ENABLED_AT.getTime());
  });
});

describe('grandfathering', () => {
  it('treats everything as grandfathered while the mode has never been on', () => {
    expect(isGrandfathered(T1, null)).toBe(true);
  });

  it('grandfathers records created before enforcement began', () => {
    expect(isGrandfathered(T0, ENABLED_AT)).toBe(true);
  });

  it('does not grandfather records created after', () => {
    expect(isGrandfathered(T1, ENABLED_AT)).toBe(false);
  });
});

describe('section 1 — batch review gating', () => {
  it('never requires review with the mode off', () => {
    expect(requiresReview({ createdAt: T1, reviewStatus: null }, OFF, ENABLED_AT)).toBe(false);
  });

  it('requires review for a new unreviewed run with the mode on', () => {
    expect(requiresReview({ createdAt: T1, reviewStatus: null }, ON, ENABLED_AT)).toBe(true);
  });

  it('never flags a run that predates the mode', () => {
    expect(requiresReview({ createdAt: T0, reviewStatus: null }, ON, ENABLED_AT)).toBe(false);
  });

  it('is satisfied only by approval, not by a pending or rejected review', () => {
    expect(requiresReview({ createdAt: T1, reviewStatus: 'approved' }, ON, ENABLED_AT)).toBe(false);
    expect(requiresReview({ createdAt: T1, reviewStatus: 'pending' }, ON, ENABLED_AT)).toBe(true);
    expect(requiresReview({ createdAt: T1, reviewStatus: 'rejected' }, ON, ENABLED_AT)).toBe(true);
  });

  it('demands a reason for a rejection', () => {
    expect(reviewSubmissionError('rejected', 'QA Lead', '')).toMatch(/notes are required/i);
    expect(reviewSubmissionError('rejected', 'QA Lead', 'Out of spec.')).toBeNull();
    expect(reviewSubmissionError('approved', 'QA Lead', null)).toBeNull();
    expect(reviewSubmissionError('approved', '   ', null)).toMatch(/reviewer name/i);
  });
});

describe('section 2 — two-person weighing', () => {
  it('does not interfere with single-person weighing when off', () => {
    expect(weighVerificationError({ weighedById: 'u1', verifiedById: null }, OFF)).toBeNull();
    expect(weighVerificationError({}, OFF)).toBeNull();
  });

  it('requires both accounts when on', () => {
    expect(weighVerificationError({}, ON)).toMatch(/sign in/i);
    expect(weighVerificationError({ weighedById: 'u1' }, ON)).toMatch(/second person/i);
    expect(weighVerificationError({ weighedById: 'u1', verifiedById: 'u2' }, ON)).toBeNull();
  });

  it('rejects one ACCOUNT signing both halves', () => {
    // The original loophole: string comparison let one person type two names.
    // Identity is now an account id, which only comes from an authenticated
    // session or a verified credential check.
    expect(weighVerificationError({ weighedById: 'u1', verifiedById: 'u1' }, ON))
      .toMatch(/different account/i);
  });

  it('is not fooled by differing display names on one account', () => {
    // Two people genuinely differ only if their ids differ.
    expect(weighVerificationError({ weighedById: 'user-abc', verifiedById: 'user-abc' }, ON)).not.toBeNull();
    expect(weighVerificationError({ weighedById: 'user-abc', verifiedById: 'user-xyz' }, ON)).toBeNull();
  });
});

describe('section 3 — deviations', () => {
  const inSpec = { targetMgPerTablet: 100, actualMgPerTablet: 102, targetTabletWeightG: 0.5, actualTabletWeightG: 0.5 };
  const outOfSpec = { targetMgPerTablet: 100, actualMgPerTablet: 90, targetTabletWeightG: 0.5, actualTabletWeightG: 0.5 };

  it('finds nothing when results are within tolerance', () => {
    expect(outOfSpecFindings(inSpec)).toEqual([]);
  });

  it('flags a result beyond tolerance, in either direction', () => {
    expect(outOfSpecFindings(outOfSpec)[0].parameter).toBe('mg per tablet');
    expect(outOfSpecFindings({ targetMgPerTablet: 100, actualMgPerTablet: 110 })[0].deviationPercent).toBeCloseTo(10);
  });

  it('treats an unrecorded COA as untested, not as a failure', () => {
    // The same rule as an untested lot being pending rather than failing.
    expect(outOfSpecFindings({ targetMgPerTablet: 100, actualMgPerTablet: null })).toEqual([]);
    expect(outOfSpecFindings({})).toEqual([]);
  });

  it('uses the same tolerance the variance display has always shown', () => {
    expect(DEVIATION_TOLERANCE_PERCENT).toBe(5);
    expect(outOfSpecFindings({ targetMgPerTablet: 100, actualMgPerTablet: 105 })).toHaveLength(1);
    expect(outOfSpecFindings({ targetMgPerTablet: 100, actualMgPerTablet: 104.9 })).toHaveLength(0);
  });

  it('never prompts with the mode off, or for a grandfathered run', () => {
    expect(requiresDeviationRecord(outOfSpec, false, OFF, { createdAt: T1 }, ENABLED_AT)).toBe(false);
    expect(requiresDeviationRecord(outOfSpec, false, ON, { createdAt: T0 }, ENABLED_AT)).toBe(false);
  });

  it('prompts for a new out-of-spec run with no deviation yet', () => {
    expect(requiresDeviationRecord(outOfSpec, false, ON, { createdAt: T1 }, ENABLED_AT)).toBe(true);
    expect(requiresDeviationRecord(outOfSpec, true, ON, { createdAt: T1 }, ENABLED_AT)).toBe(false);
  });

  it('requires a justification to accept out-of-spec material', () => {
    expect(deviationSubmissionError('accept_with_justification', '')).toMatch(/justification is required/i);
    expect(deviationSubmissionError('accept_with_justification', 'Assay within USP.')).toBeNull();
    expect(deviationSubmissionError('reject', null)).toBeNull();
  });
});

describe('section 4 — identity specs', () => {
  const withIdentity = { name: 'Mag stearate', spec: { criteria: [{ testType: 'qualitative', retiredAt: null }] } };
  const numericOnly = { name: 'Mag stearate', spec: { criteria: [{ testType: 'numeric_range', retiredAt: null }] } };
  const retiredOnly = { name: 'Mag stearate', spec: { criteria: [{ testType: 'qualitative', retiredAt: new Date() }] } };

  it('recognises a qualitative criterion as an identity spec', () => {
    expect(hasIdentitySpec(withIdentity)).toBe(true);
  });

  it('does not accept a numeric criterion as identity', () => {
    expect(hasIdentitySpec(numericOnly)).toBe(false);
  });

  it('does not count a retired criterion', () => {
    // Releasing against a spec line nobody maintains is worse than none.
    expect(hasIdentitySpec(retiredOnly)).toBe(false);
  });

  it('treats a material with no spec at all as lacking identity', () => {
    expect(hasIdentitySpec({ spec: null })).toBe(false);
    expect(hasIdentitySpec({})).toBe(false);
  });

  it('blocks new usage only when the mode is on', () => {
    expect(materialUsageError(numericOnly, OFF)).toBeNull();
    expect(materialUsageError(numericOnly, ON)).toMatch(/no identity specification/i);
    expect(materialUsageError(withIdentity, ON)).toBeNull();
  });
});

describe('section 5 — consuming a non-passing lot', () => {
  const lots = [
    { lotLabel: 'L-1', specStatus: 'pass' as const },
    { lotLabel: 'L-2', specStatus: 'fail' as const },
    { lotLabel: 'L-3', specStatus: 'pending' as const },
  ];

  it('says nothing at all with the mode off — today’s behavior', () => {
    expect(lotConsumptionIssues(lots, OFF)).toEqual([]);
  });

  it('warns without blocking under the warn setting', () => {
    const issues = lotConsumptionIssues(lots, ON);
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => !i.blocking)).toBe(true);
  });

  it('blocks under the block setting', () => {
    expect(lotConsumptionIssues(lots, ON_BLOCK).every((i) => i.blocking)).toBe(true);
  });

  it('never raises an issue for a passing lot', () => {
    expect(lotConsumptionIssues([lots[0]], ON_BLOCK)).toEqual([]);
  });
});

describe('gmpActorLabel', () => {
  it('names the account, and says when it has since been deactivated', () => {
    expect(gmpActorLabel({ name: 'A. Chen', email: 'a@x.com', deletedAt: null }, null, 'u1')).toBe('A. Chen (a@x.com)');
    expect(gmpActorLabel({ name: 'A. Chen', email: 'a@x.com', deletedAt: new Date() }, null, 'u1')).toBe(
      'A. Chen (a@x.com) — deactivated'
    );
  });

  it('marks a pre-auth typed name as unverified', () => {
    expect(gmpActorLabel(null, 'R. Adeyemi (QA)', null)).toBe('R. Adeyemi (QA) (typed name, not verified)');
  });

  it('never renders a row blank', () => {
    expect(gmpActorLabel(null, null, 'gone')).toMatch(/no longer exists/);
    expect(gmpActorLabel(null, '  ', null)).toBe('Not recorded');
  });
});

describe('GMP attribution and separation of duties', () => {
  const on = { enabled: true };
  const off = { enabled: false };
  const reviewer = { id: 'r1', role: 'reviewer' };
  const operator = { id: 'o1', role: 'operator' };

  it('lets anyone approve an OOS with GMP off, as before', () => {
    expect(oosApprovalError(off, null, 'o1')).toBeNull();
  });

  it('requires a signed-in reviewer to approve an OOS with GMP on', () => {
    expect(oosApprovalError(on, null, 'o1')).toMatch(/sign in/);
    expect(oosApprovalError(on, operator, 'x')).toMatch(/reviewer role/);
    expect(oosApprovalError(on, reviewer, 'o1')).toBeNull();
    expect(oosApprovalError(on, { id: 'a1', role: 'admin' }, 'o1')).toBeNull();
  });

  // The audit reproduced this: an investigation opened and approved by one person.
  it('refuses an OOS approval by the account that opened it', () => {
    expect(oosApprovalError(on, reviewer, 'r1')).toMatch(/cannot approve/);
  });

  it('refuses self-review of a batch with GMP on only', () => {
    expect(selfReviewError(on, 'u1', 'u1')).toMatch(/saved yourself/);
    expect(selfReviewError(on, 'u2', 'u1')).toBeNull();
    expect(selfReviewError(off, 'u1', 'u1')).toBeNull();
  });

  it('does not block review of batches with no recorded creator', () => {
    expect(selfReviewError(on, 'u1', null)).toBeNull();
  });

  // The audit reproduced this too: an approved batch overwritten, still "approved".
  it('freezes an approved batch’s composition but not its name or product', () => {
    expect(approvedRunEditError('approved', ['inputs', 'result'])).toMatch(/can’t be changed/);
    expect(approvedRunEditError('approved', ['mode'])).toMatch(/can’t be changed/);
    expect(approvedRunEditError('approved', ['label', 'product'])).toBeNull();
    expect(approvedRunEditError('pending', ['inputs'])).toBeNull();
    expect(approvedRunEditError('rejected', ['inputs'])).toBeNull();
    expect(approvedRunEditError(null, ['inputs'])).toBeNull();
  });
});
