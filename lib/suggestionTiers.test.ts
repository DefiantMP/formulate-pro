import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GLIDANT_NAME,
  applySuggestionToFields,
  resolveSuggestion,
  type SuggestionTargetFields,
} from './suggestionTiers';
import { KNOWN_ACTIVES, type FormulationSuggestion } from './knownActives';
import { deriveSavedFormulation, PERCENT_SUM_TOLERANCE } from './savedFormulations';

const blank: SuggestionTargetFields = {
  tabletWeightG: '',
  disintegrantPercent: '',
  lubricantPercent: '',
  glidantName: '',
  glidantPercent: '',
};

const aiResult: FormulationSuggestion = {
  source: 'ai',
  matchedLabel: 'Compound ZX-9',
  targetMgPerTablet: 250,
  potencyPercent: 92,
  tabletWeightG: 0.75,
  disintegrantPercent: 4,
  lubricantPercent: 1,
  glidantPercent: 0.5,
  note: 'Generic estimate.',
};

describe('resolveSuggestion — tier 1, known actives', () => {
  it('answers from the static table for a known active', () => {
    const known = KNOWN_ACTIVES[0];
    const r = resolveSuggestion(known.name);
    expect(r.tier).toBe('known');
    expect(r.suggestion?.source).toBe('known');
    expect(r.suggestion?.targetMgPerTablet).toBe(known.targetMgPerTablet);
    expect(r.suggestion?.potencyPercent).toBe(known.potencyPercent);
    expect(r.suggestion?.disintegrantPercent).toBe(known.disintegrantPercent);
    expect(r.suggestion?.lubricantPercent).toBe(known.lubricantPercent);
    expect(r.suggestion?.glidantPercent).toBe(known.glidantPercent);
  });

  it('resolves every table entry, by canonical name and by alias', () => {
    for (const profile of KNOWN_ACTIVES) {
      expect(resolveSuggestion(profile.name).tier).toBe('known');
      for (const alias of profile.aliases) {
        expect(resolveSuggestion(alias).tier).toBe('known');
      }
    }
  });

  it('never asks for the AI tier when the table has an answer', () => {
    // needsAi gates the "Suggest with AI" control, so a known active must
    // never be able to trigger an API call.
    const known = KNOWN_ACTIVES[0];
    expect(resolveSuggestion(known.name).needsAi).toBe(false);
    // Even if an AI result somehow exists, the deterministic table still wins.
    const r = resolveSuggestion(known.name, aiResult);
    expect(r.tier).toBe('known');
    expect(r.suggestion?.matchedLabel).not.toBe('Compound ZX-9');
  });
});

describe('resolveSuggestion — tier 2, unknown actives fall through', () => {
  it('reports an unknown active as needing the AI tier, with nothing to show yet', () => {
    const r = resolveSuggestion('Proprietary Compound ZX-9');
    expect(r.tier).toBe('none');
    expect(r.suggestion).toBeNull();
    expect(r.needsAi).toBe(true);
  });

  it('uses the AI result once it has arrived, tagged as AI', () => {
    const r = resolveSuggestion('Proprietary Compound ZX-9', aiResult);
    expect(r.tier).toBe('ai');
    expect(r.suggestion?.source).toBe('ai');
    expect(r.suggestion?.matchedLabel).toBe('Compound ZX-9');
  });

  it('treats an empty or too-vague label as unknown rather than matching something', () => {
    expect(resolveSuggestion('').tier).toBe('none');
    expect(resolveSuggestion('   ').tier).toBe('none');
  });
});

describe('applySuggestionToFields', () => {
  it('populates every wizard field from a suggestion when the draft is empty', () => {
    const applied = applySuggestionToFields(blank, aiResult);
    expect(applied.active).toEqual({ targetMgPerTablet: '250', potencyPercent: '92' });
    expect(applied.fields).toEqual({
      tabletWeightG: '0.75',
      disintegrantPercent: '4',
      lubricantPercent: '1',
      glidantName: DEFAULT_GLIDANT_NAME,
      glidantPercent: '0.5',
    });
  });

  it('overwrites this active’s own dose and potency, since those were what was asked for', () => {
    const applied = applySuggestionToFields(blank, aiResult);
    expect(applied.active.targetMgPerTablet).toBe('250');
  });

  it('never clobbers shared values the operator already entered', () => {
    // The shared fields are not specific to this active, so a typed figure
    // wins — silently replacing one is how a sheet gets numbers nobody chose.
    const typed: SuggestionTargetFields = {
      tabletWeightG: '0.58',
      disintegrantPercent: '10',
      lubricantPercent: '1.5',
      glidantName: 'Talc',
      glidantPercent: '2',
    };
    const applied = applySuggestionToFields(typed, aiResult);
    expect(applied.fields).toEqual(typed);
  });

  it('fills only the blanks when the draft is partly filled', () => {
    const partial = { ...blank, lubricantPercent: '1.5', glidantName: 'Talc' };
    const applied = applySuggestionToFields(partial, aiResult);
    expect(applied.fields.lubricantPercent).toBe('1.5');
    expect(applied.fields.glidantName).toBe('Talc');
    expect(applied.fields.disintegrantPercent).toBe('4');
    expect(applied.fields.tabletWeightG).toBe('0.75');
  });

  it('treats whitespace as blank', () => {
    const spaced = { ...blank, disintegrantPercent: '   ' };
    expect(applySuggestionToFields(spaced, aiResult).fields.disintegrantPercent).toBe('4');
  });
});

describe('applied suggestions and percentOverflow', () => {
  /**
   * Runs an applied suggestion through the real derivation the wizard uses.
   *
   * deriveSavedFormulation computes each active's percent-of-blend itself from
   * dose, potency and tablet weight — it does not accept one — so the dose is
   * back-solved from the percentage this test wants the active to occupy. At
   * 100% potency the raw material IS the active, so
   * percent = dose_mg / (tabletWeightG * 1000) * 100.
   */
  function overflowAfterApply(
    current: SuggestionTargetFields,
    suggestion: FormulationSuggestion,
    activePercentOfBlend: number
  ) {
    const applied = applySuggestionToFields(current, suggestion);
    const tabletWeightG = Number(applied.fields.tabletWeightG);
    const doseMg = (activePercentOfBlend / 100) * tabletWeightG * 1000;
    return deriveSavedFormulation({
      tabletWeightG,
      referenceBatchTablets: 10000,
      actives: [{ label: 'A', targetMgPerTablet: doseMg, potencyPercent: 100, source: '' }],
      disintegrantPercent: Number(applied.fields.disintegrantPercent),
      lubricantPercent: Number(applied.fields.lubricantPercent),
      glidantPercent: Number(applied.fields.glidantPercent),
    });
  }

  it('leaves a normal applied suggestion well under 100%', () => {
    // 4 + 1 + 0.5 excipients against a 3% active — the ordinary case.
    const d = overflowAfterApply(blank, aiResult, 3);
    expect(d.percentOverflow).toBe(0);
    expect(d.fillerPercent).toBeCloseTo(91.5, 6);
  });

  it('surfaces overflow rather than hiding it when the active is already large', () => {
    // fillerPercent clamps at 0, so it alone cannot reveal an over-allocated
    // blend — percentOverflow is the figure the wizard's banner reads.
    const d = overflowAfterApply(blank, aiResult, 96);
    expect(d.fillerPercent).toBe(0);
    expect(d.percentOverflow).toBeCloseTo(1.5, 6);
    expect(d.percentOverflow).toBeGreaterThan(PERCENT_SUM_TOLERANCE);
  });

  it('counts the glidant the suggestion applied toward the overflow', () => {
    // Regression: glidant is the newest of the four percentage fields, and
    // omitting it from the sum would under-report overflow by its amount.
    const withGlidant = overflowAfterApply(blank, aiResult, 96);
    const withoutGlidant = overflowAfterApply(blank, { ...aiResult, glidantPercent: 0 }, 96);
    expect(withGlidant.percentOverflow - withoutGlidant.percentOverflow).toBeCloseTo(0.5, 6);
  });

  it('computes overflow from the values actually kept, not the ones suggested', () => {
    // Applying against a 98% active: the suggestion's own 4 + 1 + 0.5 would
    // overflow, but the operator's smaller typed figures are kept, so the
    // blend fits. Overflow has to follow what was kept — reporting the
    // suggested figures would warn about a blend that does not exist.
    const typed: SuggestionTargetFields = { ...blank, disintegrantPercent: '0.5', lubricantPercent: '0.5' };
    const kept = overflowAfterApply(typed, aiResult, 98);
    expect(kept.percentOverflow).toBe(0);

    const ifSuggestedHadWon = overflowAfterApply(blank, aiResult, 98);
    expect(ifSuggestedHadWon.percentOverflow).toBeCloseTo(3.5, 6);
  });
});
