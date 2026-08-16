import { describe, it, expect } from 'vitest';
import { buildActiveSuggestionSystemPrompt, parseActiveSuggestionReply } from './activeSuggestion';

const validReply = JSON.stringify({
  targetMgPerTablet: 250,
  potencyPercent: 95,
  tabletWeightG: 0.5,
  disintegrantPercent: 4,
  lubricantPercent: 1,
  glidantPercent: 0.5,
  note: 'Generic estimate using standard tableting conventions.',
});

describe('parseActiveSuggestionReply', () => {
  it('parses a clean JSON reply, tagged as source "ai" with the queried label', () => {
    const result = parseActiveSuggestionReply('Some Proprietary Extract', validReply);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('ai');
    expect(result!.matchedLabel).toBe('Some Proprietary Extract');
    expect(result!.targetMgPerTablet).toBe(250);
    expect(result!.potencyPercent).toBe(95);
    expect(result!.tabletWeightG).toBe(0.5);
    expect(result!.disintegrantPercent).toBe(4);
    expect(result!.lubricantPercent).toBe(1);
    expect(result!.glidantPercent).toBe(0.5);
    expect(result!.note).toContain('estimate');
  });

  it('strips a markdown code fence around the JSON', () => {
    const fenced = '```json\n' + validReply + '\n```';
    expect(parseActiveSuggestionReply('X', fenced)).not.toBeNull();

    const fencedNoLang = '```\n' + validReply + '\n```';
    expect(parseActiveSuggestionReply('X', fencedNoLang)).not.toBeNull();
  });

  it('returns null for non-JSON text', () => {
    expect(parseActiveSuggestionReply('X', 'I cannot help with that.')).toBeNull();
    expect(parseActiveSuggestionReply('X', '')).toBeNull();
  });

  it('returns null when a required numeric field is missing', () => {
    const missing = JSON.stringify({
      targetMgPerTablet: 250,
      potencyPercent: 95,
      tabletWeightG: 0.5,
      disintegrantPercent: 4,
      lubricantPercent: 1,
      note: 'x',
    });
    expect(parseActiveSuggestionReply('X', missing)).toBeNull();
  });

  it('returns null when a numeric field is non-numeric or non-finite', () => {
    const nonNumeric = validReply.replace('"potencyPercent":95', '"potencyPercent":"high"');
    expect(parseActiveSuggestionReply('X', nonNumeric)).toBeNull();

    const nanValue = JSON.parse(validReply);
    nanValue.potencyPercent = Infinity;
    expect(parseActiveSuggestionReply('X', JSON.stringify(nanValue))).toBeNull();
  });

  it('returns null when note is missing or not a string', () => {
    const noNote = JSON.parse(validReply);
    delete noNote.note;
    expect(parseActiveSuggestionReply('X', JSON.stringify(noNote))).toBeNull();
  });
});

describe('buildActiveSuggestionSystemPrompt', () => {
  it('instructs JSON-only output naming every required key', () => {
    const prompt = buildActiveSuggestionSystemPrompt();
    expect(prompt).toMatch(/JSON/);
    expect(prompt).toContain('targetMgPerTablet');
    expect(prompt).toContain('potencyPercent');
    expect(prompt).toContain('tabletWeightG');
    expect(prompt).toContain('disintegrantPercent');
    expect(prompt).toContain('lubricantPercent');
    expect(prompt).toContain('glidantPercent');
    expect(prompt).toContain('note');
  });

  it('instructs a best-effort estimate rather than refusing on unfamiliar actives', () => {
    const prompt = buildActiveSuggestionSystemPrompt();
    expect(prompt).toMatch(/best general estimate/i);
  });
});
