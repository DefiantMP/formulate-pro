import { describe, expect, it } from 'vitest';
import {
  isLotSourceType,
  isRawMaterialCategory,
  isSpecTestType,
  parseSpecCriterion,
  toSpecTestInputs,
  type LotSpecTestRecord,
} from './rawMaterials';

function ok(raw: unknown) {
  const r = parseSpecCriterion(raw, 0);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.value;
}

function err(raw: unknown, index = 0) {
  const r = parseSpecCriterion(raw, index);
  if (r.ok) throw new Error('expected an error');
  return r.error;
}

describe('closed-set guards', () => {
  it('accepts every member and rejects anything else', () => {
    for (const c of ['active', 'filler', 'lubricant', 'glidant', 'disintegrant', 'other']) {
      expect(isRawMaterialCategory(c)).toBe(true);
    }
    for (const s of ['regroundTablets', 'rawPowder', 'purchased']) expect(isLotSourceType(s)).toBe(true);
    for (const t of ['numeric_range', 'qualitative']) expect(isSpecTestType(t)).toBe(true);
  });

  it('is case-sensitive and rejects non-strings — SQLite will store whatever gets past here', () => {
    expect(isRawMaterialCategory('Active')).toBe(false);
    expect(isRawMaterialCategory('diluent')).toBe(false);
    expect(isLotSourceType('regrind')).toBe(false);
    expect(isSpecTestType('numeric')).toBe(false);
    for (const v of [null, undefined, 1, {}, ['active']]) {
      expect(isRawMaterialCategory(v)).toBe(false);
      expect(isLotSourceType(v)).toBe(false);
      expect(isSpecTestType(v)).toBe(false);
    }
  });
});

describe('parseSpecCriterion — shape errors', () => {
  it('rejects non-objects', () => {
    for (const v of [null, undefined, 'Purity', 42]) expect(err(v)).toBe('criteria[0] must be an object');
  });

  it('names the failing item by its index', () => {
    expect(err({ testType: 'qualitative' }, 3)).toBe('criteria[3].parameterName is required');
  });

  it('requires a non-blank parameterName', () => {
    expect(err({ testType: 'qualitative' })).toContain('parameterName is required');
    expect(err({ parameterName: '   ', testType: 'qualitative' })).toContain('parameterName is required');
    expect(err({ parameterName: 7, testType: 'qualitative' })).toContain('parameterName is required');
  });

  it('rejects an unknown or missing testType', () => {
    expect(err({ parameterName: 'Purity' })).toContain('testType must be one of numeric_range, qualitative');
    expect(err({ parameterName: 'Purity', testType: 'range' })).toContain('testType must be one of');
  });

  it('rejects a blank or non-string id, but allows it to be absent', () => {
    expect(err({ id: '', parameterName: 'P', testType: 'qualitative' })).toContain('id must be a non-empty string');
    expect(err({ id: 12, parameterName: 'P', testType: 'qualitative' })).toContain('id must be a non-empty string');
    expect(ok({ parameterName: 'P', testType: 'qualitative' }).id).toBeUndefined();
  });

  it('rejects non-numeric bounds, including NaN and Infinity', () => {
    for (const bad of ['98', NaN, Infinity, -Infinity, true]) {
      expect(err({ parameterName: 'P', testType: 'numeric_range', minValue: bad, maxValue: 100 })).toContain(
        'minValue must be a number or null'
      );
    }
    expect(err({ parameterName: 'P', testType: 'numeric_range', maxValue: 100, targetValue: '99' })).toContain(
      'targetValue must be a number or null'
    );
  });

  it('checks bound types even on a qualitative criterion, before they are dropped', () => {
    expect(err({ parameterName: 'P', testType: 'qualitative', maxValue: 'x' })).toContain('maxValue must be a number');
  });

  it('rejects a non-string passCriteriaText', () => {
    expect(err({ parameterName: 'P', testType: 'qualitative', passCriteriaText: 5 })).toContain(
      'passCriteriaText must be a string or null'
    );
  });
});

describe('parseSpecCriterion — numeric_range', () => {
  it('requires at least one bound, since an unbounded criterion can never be evaluated', () => {
    expect(err({ parameterName: 'Purity', testType: 'numeric_range' })).toBe(
      'criteria[0] needs at least one of minValue or maxValue'
    );
    expect(err({ parameterName: 'Purity', testType: 'numeric_range', targetValue: 99 })).toContain(
      'needs at least one of minValue or maxValue'
    );
  });

  it('accepts a one-sided bound', () => {
    expect(ok({ parameterName: 'Purity', testType: 'numeric_range', minValue: 98 })).toMatchObject({
      minValue: 98,
      maxValue: null,
    });
    expect(ok({ parameterName: 'Lead', testType: 'numeric_range', maxValue: 0.5 })).toMatchObject({
      minValue: null,
      maxValue: 0.5,
    });
  });

  it('accepts 0 as a real bound rather than treating it as unset', () => {
    expect(ok({ parameterName: 'Loss on drying', testType: 'numeric_range', minValue: 0, maxValue: 0 })).toMatchObject({
      minValue: 0,
      maxValue: 0,
    });
  });

  it('rejects min greater than max, and accepts min equal to max', () => {
    expect(err({ parameterName: 'P', testType: 'numeric_range', minValue: 101, maxValue: 100 })).toContain(
      'minValue cannot exceed maxValue'
    );
    expect(ok({ parameterName: 'P', testType: 'numeric_range', minValue: 100, maxValue: 100 }).minValue).toBe(100);
  });

  it('trims the name and drops any passCriteriaText', () => {
    expect(
      ok({ parameterName: '  Purity ', testType: 'numeric_range', minValue: 98, passCriteriaText: 'stale' })
    ).toEqual({
      id: undefined,
      parameterName: 'Purity',
      testType: 'numeric_range',
      minValue: 98,
      maxValue: null,
      targetValue: null,
      passCriteriaText: null,
    });
  });

  // Pins current behaviour rather than endorsing it: a target outside its own
  // range is not rejected. See the note in the commit that added this file.
  it('does not check that targetValue lies within the bounds', () => {
    expect(ok({ parameterName: 'P', testType: 'numeric_range', minValue: 98, maxValue: 100, targetValue: 50 }).targetValue).toBe(50);
  });
});

describe('parseSpecCriterion — qualitative', () => {
  it('drops every numeric bound, so a criterion switched from numeric keeps no stale limits', () => {
    expect(
      ok({
        id: 'c1',
        parameterName: 'Identity',
        testType: 'qualitative',
        minValue: 98,
        maxValue: 100,
        targetValue: 99,
        passCriteriaText: 'FTIR matches reference',
      })
    ).toEqual({
      id: 'c1',
      parameterName: 'Identity',
      testType: 'qualitative',
      minValue: null,
      maxValue: null,
      targetValue: null,
      passCriteriaText: 'FTIR matches reference',
    });
  });

  // Pins current behaviour: a qualitative criterion with no written pass
  // condition is accepted, stored with passCriteriaText null.
  it('normalises an empty or missing passCriteriaText to null', () => {
    expect(ok({ parameterName: 'Identity', testType: 'qualitative', passCriteriaText: '' }).passCriteriaText).toBeNull();
    expect(ok({ parameterName: 'Identity', testType: 'qualitative' }).passCriteriaText).toBeNull();
  });
});

describe('toSpecTestInputs', () => {
  it('converts every date the rollup reads, including nested investigation approvals', () => {
    const record = {
      id: 't1',
      testedAt: '2026-08-13T10:00:00.000Z',
      createdAt: '2026-08-13T11:00:00.000Z',
      oosInvestigations: [
        { id: 'o1', approvedAt: '2026-08-14T09:00:00.000Z' },
        { id: 'o2', approvedAt: null },
      ],
    } as unknown as LotSpecTestRecord;
    const [converted] = toSpecTestInputs([record]);
    expect(converted.testedAt).toBeInstanceOf(Date);
    expect(converted.createdAt.toISOString()).toBe('2026-08-13T11:00:00.000Z');
    expect(converted.oosInvestigations[0].approvedAt).toBeInstanceOf(Date);
    expect(converted.oosInvestigations[1].approvedAt).toBeNull();
  });
});
