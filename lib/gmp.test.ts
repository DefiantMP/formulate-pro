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
    expect(weighVerificationError({ weighedByName: 'A', verifiedByName: null }, OFF)).toBeNull();
    expect(weighVerificationError({}, OFF)).toBeNull();
  });

  it('requires both names when on', () => {
    expect(weighVerificationError({}, ON)).toMatch(/who weighed/i);
    expect(weighVerificationError({ weighedByName: 'A. Chen' }, ON)).toMatch(/second person/i);
    expect(weighVerificationError({ weighedByName: 'A. Chen', verifiedByName: 'R. Diaz' }, ON)).toBeNull();
  });

  it('rejects one person signing both halves', () => {
    // Otherwise the control is decorative.
    expect(weighVerificationError({ weighedByName: 'A. Chen', verifiedByName: 'a. chen' }, ON))
      .toMatch(/different person/i);
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
