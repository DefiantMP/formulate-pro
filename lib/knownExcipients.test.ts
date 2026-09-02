import { describe, it, expect } from 'vitest';
import {
  KNOWN_EXCIPIENTS,
  assessExcipient,
  lookupExcipient,
} from './knownExcipients';

describe('lookupExcipient', () => {
  it('matches on canonical name, case and spacing insensitively', () => {
    expect(lookupExcipient('Magnesium stearate')?.id).toBe('magnesium-stearate');
    expect(lookupExcipient('  MAGNESIUM   STEARATE ')?.id).toBe('magnesium-stearate');
  });

  it('matches the trade and shorthand names people actually type', () => {
    // These are the spellings that appear on real batch sheets.
    expect(lookupExcipient('MAGSTEAR')?.id).toBe('magnesium-stearate');
    expect(lookupExcipient('PVPP XL')?.id).toBe('crospovidone');
    expect(lookupExcipient('DCP')?.id).toBe('dicalcium-phosphate');
    expect(lookupExcipient('Di-Calcium Phosphate')?.id).toBe('dicalcium-phosphate');
    expect(lookupExcipient('EZTAB')?.id).toBe('eztab');
    expect(lookupExcipient('Avicel PH-102')?.id).toBe('mcc');
  });

  it('returns null for anything unrecognised, which is the AI tier trigger', () => {
    expect(lookupExcipient('Proprietary Blend X')).toBeNull();
    expect(lookupExcipient('')).toBeNull();
  });

  it('does not confuse povidone with crospovidone', () => {
    // One is a binder, one is a disintegrant — conflating them would put the
    // wrong rationale next to a real formulation.
    expect(lookupExcipient('PVP')?.role).toBe('binder');
    expect(lookupExcipient('PVPP')?.role).toBe('disintegrant');
  });
});

describe('assessExcipient', () => {
  it('calls a normal lubricant level typical and explains the amount', () => {
    const a = assessExcipient('Magnesium stearate', 1);
    expect(a.verdict).toBe('typical');
    expect(a.message).toContain('0.25–2%');
    expect(a.profile?.role).toBe('lubricant');
  });

  it('flags an over-lubricated blend as above typical, with the consequence', () => {
    const a = assessExcipient('Magnesium stearate', 5);
    expect(a.verdict).toBe('above-typical');
    expect(a.message).toMatch(/capping/i);
  });

  it('flags too little disintegrant', () => {
    const a = assessExcipient('PVPP XL', 0.5);
    expect(a.verdict).toBe('below-typical');
  });

  it('treats an open-ended filler range as having no upper bound', () => {
    // A filler legitimately makes up most of the tablet, so a high percentage
    // must not be reported as unusual.
    const a = assessExcipient('EZTAB', 95.96);
    expect(a.verdict).toBe('typical');
  });

  it('says plainly when it has no basis for an opinion', () => {
    const a = assessExcipient('Proprietary Blend X', 12);
    expect(a.verdict).toBe('unknown');
    expect(a.profile).toBeNull();
    expect(a.message).toContain('no typical range');
  });

  it('never phrases a verdict as the formulation being wrong', () => {
    // Deliberate: a formulator has reasons this table cannot see, and a tool
    // that cries "wrong" about legitimate work gets ignored. Note "error" is
    // NOT banned here — EZTAB's caution legitimately warns that an error in
    // any OTHER percentage surfaces silently in the by-difference filler,
    // which is a true property of the calculation rather than a judgement on
    // the blend.
    for (const pct of [0, 0.1, 3, 50, 99]) {
      for (const e of KNOWN_EXCIPIENTS) {
        expect(assessExcipient(e.name, pct).message.toLowerCase()).not.toMatch(
          /\bwrong\b|\bincorrect\b|\binvalid\b/
        );
      }
    }
  });
});

describe('KNOWN_EXCIPIENTS table integrity', () => {
  it('has unique ids and no alias claimed by two materials', () => {
    const ids = KNOWN_EXCIPIENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const aliases = KNOWN_EXCIPIENTS.flatMap((e) => e.aliases.map((a) => a.toLowerCase()));
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it('gives every entry a purpose, an amount rationale and a caution', () => {
    // The rationale panel renders all three; a blank one would show an empty
    // explanation next to a real batch figure.
    for (const e of KNOWN_EXCIPIENTS) {
      expect(e.purpose.trim().length).toBeGreaterThan(0);
      expect(e.amountRationale.trim().length).toBeGreaterThan(0);
      expect(e.caution.trim().length).toBeGreaterThan(0);
    }
  });

  it('has coherent ranges', () => {
    for (const e of KNOWN_EXCIPIENTS) {
      expect(e.typicalMinPercent).toBeGreaterThanOrEqual(0);
      if (e.typicalMaxPercent !== null) {
        expect(e.typicalMaxPercent).toBeGreaterThan(e.typicalMinPercent);
      }
    }
  });

  it('resolves every alias back to its own entry', () => {
    for (const e of KNOWN_EXCIPIENTS) {
      for (const alias of e.aliases) {
        expect(lookupExcipient(alias)?.id).toBe(e.id);
      }
    }
  });
});
