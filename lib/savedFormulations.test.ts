import { describe, it, expect } from 'vitest';
import {
  effectiveLineageId,
  buildTroubleshootSystemPrompt,
  findRelevantCrossFormulationNotes,
  type CrossFormulationCandidate,
  type SavedFormulationRecord,
} from './savedFormulations';

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
    glidantName: null,
    glidantPercent: null,
    notes: null,
    createdAt: '2026-07-22T00:00:00.000Z',
    lineageId: null,
    version: 1,
    parentId: null,
    status: 'untested',
    outcomeNotes: null,
    equipmentNotes: null,
    ...overrides,
  };
}

function baseCandidate(overrides: Partial<CrossFormulationCandidate> = {}): CrossFormulationCandidate {
  return {
    id: 'other-1',
    name: 'PB50',
    version: 1,
    lineageId: null,
    createdAt: '2026-07-10T00:00:00.000Z',
    status: 'untested',
    outcomeNotes: null,
    equipmentNotes: null,
    actives: [{ label: 'Vitamin D', targetMgPerTablet: 10, potencyPercent: 90, source: '' }],
    fillerName: 'Dipac',
    disintegrantName: null,
    lubricantName: 'Magnesium stearate',
    glidantName: null,
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

  it('includes a Glidant line when set, and omits it entirely when not', () => {
    const withGlidant = buildTroubleshootSystemPrompt([
      baseVersion({ glidantName: 'Silicon Dioxide', glidantPercent: 0.5 }),
    ]);
    expect(withGlidant).toContain('Glidant: Silicon Dioxide 0.5%');

    const withoutGlidant = buildTroubleshootSystemPrompt([baseVersion({ glidantName: null, glidantPercent: null })]);
    expect(withoutGlidant).not.toContain('Glidant:');
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

  it('renders "none" for empty equipment notes, and the real text when set', () => {
    const untilled = buildTroubleshootSystemPrompt([baseVersion({ equipmentNotes: null })]);
    expect(untilled).toMatch(/Equipment\/tooling: none\./);

    const withNotes = buildTroubleshootSystemPrompt([
      baseVersion({ equipmentNotes: 'Press A, 3/8" round tooling, slow fill cam' }),
    ]);
    expect(withNotes).toContain('Press A, 3/8" round tooling, slow fill cam');
  });

  it('omitting crossFormulationContext leaves the prompt identical to the per-lineage-only original', () => {
    const versions = [baseVersion()];
    const withoutArg = buildTroubleshootSystemPrompt(versions);
    const withEmptyContext = buildTroubleshootSystemPrompt(versions, { promptText: '', matched: [], estimatedTokens: 0 });
    expect(withoutArg).toBe(withEmptyContext);
    expect(withoutArg).not.toContain('Relevant history from OTHER formulations');
  });

  it('appends the cross-formulation section only when its promptText is non-empty', () => {
    const prompt = buildTroubleshootSystemPrompt([baseVersion()], {
      promptText: 'Relevant history from OTHER formulations (matched by keyword overlap...):\n[SUCCESS] "PB50" v2 — Outcome: fixed by upping lubricant',
      matched: [],
      estimatedTokens: 20,
    });
    expect(prompt).toContain('Relevant history from OTHER formulations');
    expect(prompt).toContain('fixed by upping lubricant');
  });
});

describe('findRelevantCrossFormulationNotes', () => {
  it('excludes candidates from the current lineage — that history is already covered in full elsewhere', () => {
    const sameLineage = baseCandidate({ id: 'same', lineageId: 'lineage-a', outcomeNotes: 'capping issue resolved' });
    const result = findRelevantCrossFormulationNotes(
      [sameLineage],
      'lineage-a',
      { actives: [{ label: 'API', targetMgPerTablet: 60, potencyPercent: 76.4, source: '' }], fillerName: 'Emdex', disintegrantName: null, lubricantName: null, glidantName: null },
      'capping issue'
    );
    expect(result.matched).toHaveLength(0);
    expect(result.promptText).toBe('');
  });

  it('is relevance-filtered, not recency-only: excludes a recent but unrelated candidate and includes an older but relevant one', () => {
    const recentUnrelated = baseCandidate({
      id: 'recent',
      name: 'Totally Different Product',
      createdAt: '2026-07-28T00:00:00.000Z',
      outcomeNotes: 'ran fine, no issues, standard batch',
      actives: [{ label: 'Zinc', targetMgPerTablet: 5, potencyPercent: 50, source: '' }],
      fillerName: 'Avicel',
    });
    const olderRelevant = baseCandidate({
      id: 'older',
      name: 'PB50',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'failed',
      outcomeNotes: 'severe capping at compression, tooling wear suspected',
    });

    const result = findRelevantCrossFormulationNotes(
      [recentUnrelated, olderRelevant],
      'current-lineage',
      { actives: [{ label: 'API', targetMgPerTablet: 60, potencyPercent: 76.4, source: '' }], fillerName: 'Emdex', disintegrantName: null, lubricantName: null, glidantName: null },
      'tablets are capping at compression, what should I check?'
    );

    expect(result.matched.map((m) => m.id)).toEqual(['older']);
  });

  it('excludes candidates with no outcome or equipment notes at all, even if composition overlaps', () => {
    const noNotes = baseCandidate({ outcomeNotes: null, equipmentNotes: null, fillerName: 'Emdex' });
    const result = findRelevantCrossFormulationNotes(
      [noNotes],
      'current-lineage',
      { actives: [], fillerName: 'Emdex', disintegrantName: null, lubricantName: null, glidantName: null },
      'Emdex filler question'
    );
    expect(result.matched).toHaveLength(0);
  });

  it('caps the number of included iterations at 15 even when more score above zero', () => {
    const candidates = Array.from({ length: 25 }, (_, i) =>
      baseCandidate({ id: `c${i}`, outcomeNotes: 'capping at compression, adjusted lubricant', createdAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z` })
    );
    const result = findRelevantCrossFormulationNotes(
      candidates,
      'current-lineage',
      { actives: [], fillerName: 'Emdex', disintegrantName: null, lubricantName: null, glidantName: null },
      'capping at compression'
    );
    expect(result.matched.length).toBeLessThanOrEqual(15);
    expect(result.matched.length).toBe(15);
  });

  it('truncates each included note to 300 characters', () => {
    const longNote = 'capping at compression — ' + 'x'.repeat(400);
    const candidate = baseCandidate({ outcomeNotes: longNote });
    const result = findRelevantCrossFormulationNotes(
      [candidate],
      'current-lineage',
      { actives: [], fillerName: 'Emdex', disintegrantName: null, lubricantName: null, glidantName: null },
      'capping at compression'
    );
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].outcomeNotesExcerpt!.length).toBeLessThanOrEqual(301); // 300 chars + ellipsis
    expect(result.matched[0].outcomeNotesExcerpt).toContain('…');
  });

  it('tags successes and failures distinctly in the rendered prompt text', () => {
    const success = baseCandidate({ id: 'ok', name: 'Winner', status: 'passed', outcomeNotes: 'capping resolved by increasing lubricant to 2%' });
    const failure = baseCandidate({ id: 'bad', name: 'Loser', status: 'failed', outcomeNotes: 'capping got worse after increasing lubricant to 2%' });

    const result = findRelevantCrossFormulationNotes(
      [success, failure],
      'current-lineage',
      { actives: [], fillerName: 'Emdex', disintegrantName: null, lubricantName: null, glidantName: null },
      'capping issue, tried increasing lubricant'
    );

    expect(result.promptText).toContain('[SUCCESS] "Winner"');
    expect(result.promptText).toContain('[FAILURE] "Loser"');
    const successIdx = result.promptText.indexOf('[SUCCESS]');
    const failureIdx = result.promptText.indexOf('[FAILURE]');
    expect(successIdx).toBeGreaterThan(-1);
    expect(failureIdx).toBeGreaterThan(-1);
  });

  it('returns a positive, roughly length-proportional token estimate when something matches, and zero otherwise', () => {
    const matching = baseCandidate({ outcomeNotes: 'capping at compression resolved' });
    const withMatch = findRelevantCrossFormulationNotes(
      [matching],
      'current-lineage',
      { actives: [], fillerName: 'Emdex', disintegrantName: null, lubricantName: null, glidantName: null },
      'capping at compression'
    );
    expect(withMatch.estimatedTokens).toBeGreaterThan(0);
    expect(withMatch.estimatedTokens).toBe(Math.ceil(withMatch.promptText.length / 4));

    const noMatch = findRelevantCrossFormulationNotes(
      [baseCandidate({ outcomeNotes: 'totally unrelated zinc batch note' })],
      'current-lineage',
      { actives: [], fillerName: 'Emdex', disintegrantName: null, lubricantName: null, glidantName: null },
      'capping at compression'
    );
    expect(noMatch.estimatedTokens).toBe(0);
  });
});
