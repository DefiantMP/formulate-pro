import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  extractFormulation,
  parseExtractedFormulation,
  parseNoteTranscription,
  transcribeNote,
} from './documentReading';

const toolReply = (name: string, input: unknown) =>
  ({ content: [{ type: 'tool_use', id: 't', name, input }] }) as unknown as Anthropic.Message;

const img = { kind: 'image' as const, mediaType: 'image/jpeg', base64: 'AAAA' };
const pdf = { kind: 'pdf' as const, mediaType: 'application/pdf', base64: 'AAAA' };

describe('transcribeNote', () => {
  it('sends an image block and returns the verbatim text', async () => {
    const create = vi.fn().mockResolvedValue(
      toolReply('report_transcription', { text: ' PB14G capped at 0.58 g ', illegibleCount: 0, reviewHints: [] })
    );
    const r = await transcribeNote(img, create);
    expect(r).toEqual({ ok: true, result: { text: 'PB14G capped at 0.58 g', illegibleCount: 0, reviewHints: [] } });
    const content = create.mock.calls[0][0].messages[0].content;
    expect(content[0].type).toBe('image');
  });

  it('sends a PDF as a document block', async () => {
    const create = vi.fn().mockResolvedValue(toolReply('report_transcription', { text: 'x', illegibleCount: 0, reviewHints: [] }));
    await transcribeNote(pdf, create);
    expect(create.mock.calls[0][0].messages[0].content[0].type).toBe('document');
  });

  it('reports a failed request rather than throwing', async () => {
    const r = await transcribeNote(img, vi.fn().mockRejectedValue(new Error('overloaded')));
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});

describe('parseNoteTranscription', () => {
  it('counts [illegible] from the text, not from what the model claims', () => {
    const r = parseNoteTranscription({ text: 'Mag [illegible]% and [Illegible] g', illegibleCount: 0, reviewHints: [] });
    expect(r.ok && r.result.illegibleCount).toBe(2);
  });

  it('rejects a reply with no text', () => {
    expect(parseNoteTranscription({ illegibleCount: 0 }).ok).toBe(false);
  });
});

describe('parseExtractedFormulation', () => {
  const good = {
    name: 'RR77-PB9',
    tabletWeightG: 0.69,
    referenceBatchTablets: 10887,
    actives: [{ label: '7OH', targetMgPerTablet: 60, potencyPercent: 76.4 }],
    fillerName: 'Emdex',
    excipients: [
      { name: 'PVPP XL', percentOfBlend: 4, role: 'disintegrant' },
      { name: 'Magnesium stearate', percentOfBlend: 1, role: 'lubricant' },
      { name: 'EZTAB', percentOfBlend: 10, role: 'other' },
    ],
    sheetGrams: [{ name: '7OH', grams: 855 }],
    sheetTotalGrams: 7512.03,
    notes: 'Adjusted PVPP from 5% to 4%',
    uncertainFields: [],
  };

  it('keeps a clean reading intact, including any number of excipients', () => {
    const r = parseExtractedFormulation(good);
    expect(r.ok && r.result.excipients).toHaveLength(3);
    expect(r.ok && r.result).toMatchObject({ name: 'RR77-PB9', tabletWeightG: 0.69, referenceBatchTablets: 10887 });
  });

  // A clamped misread looks like a real value; null shows as "not read".
  it('turns out-of-range numbers into null rather than clamping them', () => {
    const r = parseExtractedFormulation({
      ...good,
      tabletWeightG: -0.69,
      actives: [{ label: '7OH', targetMgPerTablet: 60, potencyPercent: 764 }],
      excipients: [{ name: 'PVPP XL', percentOfBlend: 140, role: 'disintegrant' }],
    });
    expect(r.ok && r.result.tabletWeightG).toBeNull();
    expect(r.ok && r.result.actives[0].potencyPercent).toBeNull();
    expect(r.ok && r.result.excipients[0].percentOfBlend).toBeNull();
  });

  it('drops unnamed rows and defaults an unknown role to other', () => {
    const r = parseExtractedFormulation({
      ...good,
      actives: [{ label: '', targetMgPerTablet: 60, potencyPercent: 76 }],
      excipients: [{ name: 'Talc', percentOfBlend: 2, role: 'flow' }, { name: '', percentOfBlend: 1, role: 'other' }],
    });
    expect(r.ok && r.result.actives).toEqual([]);
    expect(r.ok && r.result.excipients).toEqual([{ name: 'Talc', percentOfBlend: 2, role: 'other' }]);
  });

  it('round-trips through extractFormulation', async () => {
    const r = await extractFormulation(pdf, vi.fn().mockResolvedValue(toolReply('report_formulation', good)));
    expect(r.ok && r.result.fillerName).toBe('Emdex');
  });
});

describe('text input', () => {
  it('sends text read from a Word or text file as a text document', async () => {
    const create = vi.fn().mockResolvedValue(toolReply('report_formulation', { actives: [], excipients: [], sheetGrams: [], uncertainFields: [] }));
    await extractFormulation({ kind: 'text', text: 'RR77 PB9 ...' }, create);
    const block = create.mock.calls[0][0].messages[0].content[0];
    expect(block).toMatchObject({ type: 'document', source: { type: 'text', data: 'RR77 PB9 ...' } });
  });
});
