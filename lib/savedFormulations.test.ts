import { describe, it, expect } from 'vitest';
import { effectiveLineageId, buildTroubleshootSystemPrompt, type SavedFormulationRecord } from './savedFormulations';

function baseVersion(overrides: Partial<SavedFormulationRecord> = {}): SavedFormulationRecord {
  return {
    id: 'v1',
    name: 'RR77-PB9',
    tabletWeightG: 0.69,
    referenceBatchTablets: 10887,
    actives: [{ label: 'API', targetMgPerTablet: 60, potencyPercent: 76.4, source: '' }],
    fillerName: 'Emdex',
    disintegrantName: 'PVPP XL',
    disintegrantPercent: 5,
    lubricantName: 'Magnesium stearate',
    lubricantPercent: 2,
    notes: null,
    createdAt: '2026-07-22T00:00:00.000Z',
    lineageId: null,
    version: 1,
    parentId: null,
    status: 'untested',
    outcomeNotes: null,
    ...overrides,
  };
}

describe('effectiveLineageId', () => {
  it('falls back to the row\'s own id when lineageId is null (a lineage root)', () => {
    expect(effectiveLineageId({ id: 'abc', lineageId: null })).toBe('abc');
  });

  it('returns the explicit lineageId when set (an iterated version)', () => {
    expect(effectiveLineageId({ id: 'v2', lineageId: 'abc' })).toBe('abc');
  });
});

describe('buildTroubleshootSystemPrompt', () => {
  it('includes every version in ascending order regardless of input order, with its composition, status, and notes', () => {
    const v1 = baseVersion({ id: 'v1', version: 1, status: 'passed', outcomeNotes: null });
    const v2 = baseVersion({
      id: 'v2',
      version: 2,
      status: 'issue',
      outcomeNotes: 'capping at compression',
      lubricantPercent: 3,
    });

    const prompt = buildTroubleshootSystemPrompt([v2, v1]);

    const v1Index = prompt.indexOf('Version 1');
    const v2Index = prompt.indexOf('Version 2');
    expect(v1Index).toBeGreaterThan(-1);
    expect(v2Index).toBeGreaterThan(-1);
    expect(v1Index).toBeLessThan(v2Index);

    expect(prompt).toMatch(/Version 1.*Status: Passed/s);
    expect(prompt).toMatch(/Version 2.*Status: Issue noted/s);
    expect(prompt).toContain('capping at compression');
    expect(prompt).toContain('API 60mg/tab @ 76.4% potency');
  });

  it('reflects a changed excipient percentage between versions in the composition text', () => {
    const v1 = baseVersion({ id: 'v1', version: 1, lubricantPercent: 2 });
    const v2 = baseVersion({ id: 'v2', version: 2, lubricantPercent: 3 });

    const prompt = buildTroubleshootSystemPrompt([v1, v2]);

    expect(prompt).toMatch(/Version 1.*Lubricant: Magnesium stearate 2%/s);
    expect(prompt).toMatch(/Version 2.*Lubricant: Magnesium stearate 3%/s);
  });

  it('renders "none" for empty outcome notes rather than a blank', () => {
    const v1 = baseVersion({ outcomeNotes: null });
    const prompt = buildTroubleshootSystemPrompt([v1]);
    expect(prompt).toMatch(/Notes: none\./);
  });

  it('instructs the model its suggestions are advisory only, never applied automatically', () => {
    const prompt = buildTroubleshootSystemPrompt([baseVersion()]);
    expect(prompt).toMatch(/advisory/i);
    expect(prompt).toMatch(/not making any change/i);
  });
});
