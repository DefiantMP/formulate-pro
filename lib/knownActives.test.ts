import { describe, it, expect } from 'vitest';
import {
  findKnownActiveMatch,
  knownActiveToSuggestion,
  suggestionProvenanceLabel,
  KNOWN_ACTIVES,
} from './knownActives';

describe('findKnownActiveMatch', () => {
  it('matches by exact canonical name, case-insensitively', () => {
    expect(findKnownActiveMatch('ibuprofen')?.id).toBe('ibuprofen');
    expect(findKnownActiveMatch('IBUPROFEN')?.id).toBe('ibuprofen');
    expect(findKnownActiveMatch('  Ibuprofen  ')?.id).toBe('ibuprofen');
  });

  it('matches by alias', () => {
    expect(findKnownActiveMatch('Tylenol')?.id).toBe('acetaminophen');
    expect(findKnownActiveMatch('paracetamol')?.id).toBe('acetaminophen');
    expect(findKnownActiveMatch('ASA')?.id).toBe('aspirin');
  });

  it('does not fuzzy/substring match — only exact name or alias', () => {
    expect(findKnownActiveMatch('a proprietary botanical extract')).toBeNull();
    expect(findKnownActiveMatch('ibu')).toBeNull();
    expect(findKnownActiveMatch('ibuprofen 200mg')).toBeNull();
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(findKnownActiveMatch('')).toBeNull();
    expect(findKnownActiveMatch('   ')).toBeNull();
  });

  it('every profile has a unique id', () => {
    const ids = KNOWN_ACTIVES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('knownActiveToSuggestion', () => {
  it('carries the profile values through, tagged as source "known"', () => {
    const profile = KNOWN_ACTIVES[0];
    const s = knownActiveToSuggestion(profile);
    expect(s.source).toBe('known');
    expect(s.matchedLabel).toBe(profile.name);
    expect(s.targetMgPerTablet).toBe(profile.targetMgPerTablet);
    expect(s.potencyPercent).toBe(profile.potencyPercent);
    expect(s.tabletWeightG).toBe(profile.tabletWeightG);
    expect(s.disintegrantPercent).toBe(profile.disintegrantPercent);
    expect(s.lubricantPercent).toBe(profile.lubricantPercent);
    expect(s.glidantPercent).toBe(profile.glidantPercent);
    expect(s.note).toBe(profile.note);
  });
});

describe('provenance', () => {
  it('tags every shipped entry as pharmacopeial', () => {
    // Nothing in the table is derived from this operator's own history yet —
    // see the analysis in the commit adding provenance. If an internal entry
    // is ever added, it must carry a record count rather than inherit this.
    for (const profile of KNOWN_ACTIVES) {
      expect(profile.provenance).toEqual({ kind: 'pharmacopeial' });
    }
  });

  it('carries provenance through to the suggestion', () => {
    const s = knownActiveToSuggestion(KNOWN_ACTIVES[0]);
    expect(s.provenance).toEqual({ kind: 'pharmacopeial' });
  });

  it('labels a pharmacopeial entry as generic reference data', () => {
    const s = knownActiveToSuggestion(KNOWN_ACTIVES[0]);
    expect(suggestionProvenanceLabel(s)).toBe('Reference values — pharmacopeial');
  });

  it('labels an internally-derived entry with its record count', () => {
    const s = knownActiveToSuggestion({
      ...KNOWN_ACTIVES[0],
      provenance: { kind: 'internal', derivedFromRuns: 4 },
    });
    expect(suggestionProvenanceLabel(s)).toBe('From your history — 4 runs');
  });

  it('says plainly when an internal entry rests on a single run', () => {
    // One run is a data point, not a norm. The singular wording exists so an
    // operator cannot mistake it for an established figure.
    const s = knownActiveToSuggestion({
      ...KNOWN_ACTIVES[0],
      provenance: { kind: 'internal', derivedFromRuns: 1 },
    });
    expect(suggestionProvenanceLabel(s)).toBe('From your history — 1 run only');
  });

  it('never labels an AI suggestion as reference values', () => {
    expect(
      suggestionProvenanceLabel({
        source: 'ai',
        matchedLabel: 'X',
        targetMgPerTablet: 1,
        potencyPercent: 1,
        tabletWeightG: 1,
        disintegrantPercent: 1,
        lubricantPercent: 1,
        glidantPercent: 1,
        note: '',
      })
    ).toBe('AI-suggested — not validated');
  });
});
