import { describe, expect, it } from 'vitest';
import { buildExcipientRationaleSystemPrompt, parseExcipientRationaleReply } from './excipientRationale';

const good = JSON.stringify({
  purpose: 'A co-processed filler-binder for direct compression.',
  typicalMinPercent: 20,
  typicalMaxPercent: 80,
  caution: 'Hygroscopic; keep containers closed.',
  uncertain: false,
});

describe('excipient rationale prompt', () => {
  it('asks for null rather than a guessed range, and for an uncertainty flag', () => {
    const p = buildExcipientRationaleSystemPrompt();
    expect(p).toMatch(/null/);
    expect(p).toMatch(/uncertain/);
    expect(p).toMatch(/real batch/);
  });
});

describe('parseExcipientRationaleReply', () => {
  it('parses a clean reply', () => {
    expect(parseExcipientRationaleReply('Prosolv', good)).toEqual({
      name: 'Prosolv',
      purpose: 'A co-processed filler-binder for direct compression.',
      typicalMinPercent: 20,
      typicalMaxPercent: 80,
      caution: 'Hygroscopic; keep containers closed.',
      uncertain: false,
    });
  });

  it('tolerates a markdown fence', () => {
    expect(parseExcipientRationaleReply('Prosolv', '```json\n' + good + '\n```')?.purpose).toBeTruthy();
  });

  it('accepts null bounds — a filler making up the balance', () => {
    const r = parseExcipientRationaleReply(
      'House premix',
      JSON.stringify({ purpose: 'Bulk filler.', typicalMinPercent: null, typicalMaxPercent: null, caution: '', uncertain: true })
    );
    expect(r).toMatchObject({ typicalMinPercent: null, typicalMaxPercent: null, uncertain: true });
  });

  it('treats a missing uncertain flag as uncertain, never as confidence', () => {
    const r = parseExcipientRationaleReply(
      'Mystery',
      JSON.stringify({ purpose: 'Something.', typicalMinPercent: 1, typicalMaxPercent: 2, caution: '' })
    );
    expect(r?.uncertain).toBe(true);
  });

  it('rejects junk, missing fields and a backwards range', () => {
    expect(parseExcipientRationaleReply('X', 'not json')).toBeNull();
    expect(parseExcipientRationaleReply('X', JSON.stringify({ caution: 'c' }))).toBeNull();
    expect(
      parseExcipientRationaleReply('X', JSON.stringify({ purpose: 'p', caution: 'c', typicalMinPercent: 80, typicalMaxPercent: 20 }))
    ).toBeNull();
    expect(
      parseExcipientRationaleReply('X', JSON.stringify({ purpose: 'p', caution: 'c', typicalMinPercent: 'lots', typicalMaxPercent: null }))
    ).toBeNull();
  });
});
