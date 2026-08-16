import { describe, it, expect } from 'vitest';
import { findKnownActiveMatch, knownActiveToSuggestion, KNOWN_ACTIVES } from './knownActives';

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
