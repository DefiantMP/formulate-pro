import { describe, it, expect } from 'vitest';
import {
  computeCriterionStatuses,
  computeLotSpecStatus,
  evaluateNumericResult,
  isFailureInvalidated,
  isInvalidatingInvestigation,
  resolveCriterionStatus,
  resolveLatestTests,
  lotSpecStatus,
  type SpecCriterionInput,
  type LotSpecTestInput,
  type OosInvestigationInput,
} from './lotSpecStatus';

const identity: SpecCriterionInput = { id: 'c-identity', testType: 'qualitative' };
const purity: SpecCriterionInput = {
  id: 'c-purity',
  testType: 'numeric_range',
  minValue: 98,
  maxValue: 102,
};
const heavyMetals: SpecCriterionInput = {
  id: 'c-heavy-metals',
  testType: 'numeric_range',
  minValue: null,
  maxValue: 10,
};

let testSeq = 0;

function test(
  specCriterionId: string,
  passFail: boolean,
  testedAt = new Date('2026-08-13T12:00:00Z'),
  oosInvestigations: OosInvestigationInput[] = []
): LotSpecTestInput {
  return { id: `t-${++testSeq}`, specCriterionId, passFail, testedAt, oosInvestigations };
}

/** An approved investigation that does set the original result aside. */
function invalidated(): OosInvestigationInput {
  return {
    disposition: 'invalidate_original_result',
    approvedBy: 'qa.manager',
    approvedAt: new Date('2026-08-04T00:00:00Z'),
  };
}

describe('evaluateNumericResult', () => {
  it('passes inside an inclusive two-sided range', () => {
    expect(evaluateNumericResult(purity, 100)).toBe(true);
    expect(evaluateNumericResult(purity, 98)).toBe(true);
    expect(evaluateNumericResult(purity, 102)).toBe(true);
  });

  it('fails outside the range on either side', () => {
    expect(evaluateNumericResult(purity, 97.9)).toBe(false);
    expect(evaluateNumericResult(purity, 102.1)).toBe(false);
  });

  it('supports a one-sided max limit (heavy metals)', () => {
    expect(evaluateNumericResult(heavyMetals, 0)).toBe(true);
    expect(evaluateNumericResult(heavyMetals, 10)).toBe(true);
    expect(evaluateNumericResult(heavyMetals, 10.5)).toBe(false);
  });

  it('is unevaluable (null, not a pass) with no result or no bounds', () => {
    expect(evaluateNumericResult(purity, null)).toBeNull();
    expect(evaluateNumericResult(purity, undefined)).toBeNull();
    expect(evaluateNumericResult(purity, NaN)).toBeNull();
    expect(evaluateNumericResult({ minValue: null, maxValue: null }, 100)).toBeNull();
  });
});

describe('isInvalidatingInvestigation', () => {
  it('requires approval AND an invalidating disposition', () => {
    expect(isInvalidatingInvestigation(invalidated())).toBe(true);
  });

  it('rejects an invalidating disposition that is not yet approved', () => {
    expect(
      isInvalidatingInvestigation({ disposition: 'invalidate_original_result' })
    ).toBe(false);
    expect(
      isInvalidatingInvestigation({
        disposition: 'invalidate_original_result',
        approvedBy: 'qa.manager',
        approvedAt: null,
      })
    ).toBe(false);
    expect(
      isInvalidatingInvestigation({
        disposition: 'invalidate_original_result',
        approvedBy: null,
        approvedAt: new Date('2026-08-04T00:00:00Z'),
      })
    ).toBe(false);
  });

  it('rejects every non-invalidating disposition, even when approved', () => {
    for (const disposition of ['pending', 'confirm_original_result', 'reject_lot']) {
      expect(
        isInvalidatingInvestigation({
          disposition,
          approvedBy: 'qa.manager',
          approvedAt: new Date('2026-08-04T00:00:00Z'),
        })
      ).toBe(false);
    }
  });
});

describe('isFailureInvalidated', () => {
  it('is false with no investigation at all', () => {
    expect(isFailureInvalidated(test('c-purity', false))).toBe(false);
  });

  it('accepts any qualifying investigation, past a non-qualifying one', () => {
    const failed = test('c-purity', false, new Date('2026-08-01T00:00:00Z'), [
      { disposition: 'confirm_original_result', approvedBy: 'qa', approvedAt: new Date() },
      invalidated(),
    ]);
    expect(isFailureInvalidated(failed)).toBe(true);
  });
});

describe('resolveCriterionStatus — a failure is sticky', () => {
  const earlier = new Date('2026-08-01T00:00:00Z');
  const later = new Date('2026-08-05T00:00:00Z');

  it('stays fail when a passing retest follows an uninvestigated failure', () => {
    expect(
      resolveCriterionStatus([test('c-purity', false, earlier), test('c-purity', true, later)])
    ).toBe('fail');
  });

  it('clears only with an approved invalidate_original_result investigation', () => {
    expect(
      resolveCriterionStatus([
        test('c-purity', false, earlier, [invalidated()]),
        test('c-purity', true, later),
      ])
    ).toBe('pass');
  });

  it('stays fail when the investigation confirms the original result', () => {
    const confirmed: OosInvestigationInput = {
      disposition: 'confirm_original_result',
      approvedBy: 'qa.manager',
      approvedAt: new Date('2026-08-04T00:00:00Z'),
    };
    expect(
      resolveCriterionStatus([
        test('c-purity', false, earlier, [confirmed]),
        test('c-purity', true, later),
      ])
    ).toBe('fail');
  });

  it('stays fail when the investigation rejects the lot', () => {
    const rejected: OosInvestigationInput = {
      disposition: 'reject_lot',
      approvedBy: 'qa.manager',
      approvedAt: new Date('2026-08-04T00:00:00Z'),
    };
    expect(
      resolveCriterionStatus([
        test('c-purity', false, earlier, [rejected]),
        test('c-purity', true, later),
      ])
    ).toBe('fail');
  });

  it('stays fail while the investigation is still open (unapproved)', () => {
    expect(
      resolveCriterionStatus([
        test('c-purity', false, earlier, [{ disposition: 'invalidate_original_result' }]),
        test('c-purity', true, later),
      ])
    ).toBe('fail');
  });

  it('is pending for an invalidated failure with no subsequent passing retest', () => {
    // The bad result is set aside, but nothing has since demonstrated the
    // lot conforms — that is pending, not pass.
    expect(resolveCriterionStatus([test('c-purity', false, earlier, [invalidated()])])).toBe(
      'pending'
    );
  });

  it('still fails on a NEW failure after an invalidated one', () => {
    expect(
      resolveCriterionStatus([
        test('c-purity', false, earlier, [invalidated()]),
        test('c-purity', true, later),
        test('c-purity', false, new Date('2026-08-09T00:00:00Z')),
      ])
    ).toBe('fail');
  });

  it('is pending with no tests, pass with only passing tests', () => {
    expect(resolveCriterionStatus([])).toBe('pending');
    expect(resolveCriterionStatus([test('c-purity', true)])).toBe('pass');
  });
});

describe('computeLotSpecStatus', () => {
  const criteria = [identity, purity, heavyMetals];

  it('passes only when every criterion has a passing test', () => {
    expect(
      computeLotSpecStatus(criteria, [
        test('c-identity', true),
        test('c-purity', true),
        test('c-heavy-metals', true),
      ])
    ).toBe('pass');
  });

  it('fails if any criterion failed, even with others untested', () => {
    expect(computeLotSpecStatus(criteria, [test('c-purity', false)])).toBe('fail');
  });

  it('fails ahead of pending — one out-of-spec parameter condemns the lot', () => {
    expect(
      computeLotSpecStatus(criteria, [test('c-identity', true), test('c-heavy-metals', false)])
    ).toBe('fail');
  });

  it('holds the whole lot at fail on one criterion retested without an OOS', () => {
    expect(
      computeLotSpecStatus(criteria, [
        test('c-identity', true),
        test('c-heavy-metals', true),
        test('c-purity', false, new Date('2026-08-01T00:00:00Z')),
        test('c-purity', true, new Date('2026-08-05T00:00:00Z')),
      ])
    ).toBe('fail');
  });

  it('releases the lot once that failure is invalidated by an approved OOS', () => {
    expect(
      computeLotSpecStatus(criteria, [
        test('c-identity', true),
        test('c-heavy-metals', true),
        test('c-purity', false, new Date('2026-08-01T00:00:00Z'), [invalidated()]),
        test('c-purity', true, new Date('2026-08-05T00:00:00Z')),
      ])
    ).toBe('pass');
  });

  it('is pending when a criterion has no test yet', () => {
    expect(computeLotSpecStatus(criteria, [test('c-identity', true), test('c-purity', true)])).toBe(
      'pending'
    );
  });

  it('is pending, not pass, for a lot with no spec or an empty one', () => {
    expect(computeLotSpecStatus([], [])).toBe('pending');
    // Even a stray passing test can't release a lot with nothing to test against.
    expect(computeLotSpecStatus([], [test('c-purity', true)])).toBe('pending');
  });

  it('ignores tests for criteria no longer on the spec', () => {
    // heavyMetals was dropped from the spec after failing; the lot is not
    // condemned by a criterion it is no longer held to. The row itself is
    // still in the DB — this only affects the rollup.
    expect(
      computeLotSpecStatus(
        [identity, purity],
        [test('c-identity', true), test('c-purity', true), test('c-heavy-metals', false)]
      )
    ).toBe('pass');
  });
});

describe('computeCriterionStatuses', () => {
  it('reports which parameter is holding the lot back', () => {
    const statuses = computeCriterionStatuses(
      [identity, purity, heavyMetals],
      [
        test('c-identity', true),
        test('c-purity', false, new Date('2026-08-01T00:00:00Z')),
        test('c-purity', true, new Date('2026-08-05T00:00:00Z')),
      ]
    );
    expect(statuses).toEqual([
      { criterionId: 'c-identity', status: 'pass' },
      { criterionId: 'c-purity', status: 'fail' },
      { criterionId: 'c-heavy-metals', status: 'pending' },
    ]);
  });
});

describe('resolveLatestTests (display helper, not status)', () => {
  it('keeps the most recent test per criterion', () => {
    const older = test('c-purity', false, new Date('2026-08-01T00:00:00Z'));
    const newer = test('c-purity', true, new Date('2026-08-05T00:00:00Z'));
    expect(resolveLatestTests([newer, older]).get('c-purity')).toBe(newer);
  });

  it('breaks a testedAt tie with createdAt', () => {
    const sameTestedAt = new Date('2026-08-01T00:00:00Z');
    const first = { ...test('c-purity', false, sameTestedAt), createdAt: new Date('2026-08-01T09:00:00Z') };
    const second = { ...test('c-purity', true, sameTestedAt), createdAt: new Date('2026-08-01T17:00:00Z') };
    expect(resolveLatestTests([second, first]).get('c-purity')).toBe(second);
  });

  it('disagrees with the status rollup by design — recency alone never clears a failure', () => {
    const tests = [
      test('c-purity', false, new Date('2026-08-01T00:00:00Z')),
      test('c-purity', true, new Date('2026-08-05T00:00:00Z')),
    ];
    expect(resolveLatestTests(tests).get('c-purity')?.passFail).toBe(true);
    expect(resolveCriterionStatus(tests)).toBe('fail');
  });
});

describe('lotSpecStatus', () => {
  it('reads criteria through the rawMaterial.spec relation', () => {
    expect(
      lotSpecStatus({
        rawMaterial: { spec: { criteria: [identity] } },
        specTests: [test('c-identity', true)],
      })
    ).toBe('pass');
  });

  it('is pending when the raw material has no spec at all', () => {
    expect(lotSpecStatus({ rawMaterial: { spec: null }, specTests: [] })).toBe('pending');
  });
});
