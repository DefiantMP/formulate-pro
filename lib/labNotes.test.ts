import { describe, expect, it } from 'vitest';
import { LAB_NOTE_MAX_LENGTH, effectiveNoteProduct, parseLabNote, retractionProblem } from './labNotes';

describe('parseLabNote', () => {
  it('trims and accepts a plain note', () => {
    expect(parseLabNote({ body: '  Capping at 0.58 g  ', product: ' OGS ' })).toEqual({
      ok: true,
      value: { body: 'Capping at 0.58 g', product: 'OGS', runId: null },
    });
  });

  it('refuses an empty note', () => {
    for (const body of ['', '   ', undefined, 42]) {
      expect(parseLabNote({ body }).ok).toBe(false);
    }
  });

  it('refuses an overlong note', () => {
    expect(parseLabNote({ body: 'x'.repeat(LAB_NOTE_MAX_LENGTH + 1) }).ok).toBe(false);
    expect(parseLabNote({ body: 'x'.repeat(LAB_NOTE_MAX_LENGTH) }).ok).toBe(true);
  });

  it('treats a blank product as none and rejects non-text ones', () => {
    expect(parseLabNote({ body: 'n', product: '   ' })).toMatchObject({ ok: true, value: { product: null } });
    expect(parseLabNote({ body: 'n', product: 7 }).ok).toBe(false);
  });

  it('accepts a run id and rejects a blank one', () => {
    expect(parseLabNote({ body: 'n', runId: 'r1' })).toMatchObject({ ok: true, value: { runId: 'r1' } });
    expect(parseLabNote({ body: 'n', runId: '  ' }).ok).toBe(false);
  });
});

describe('retractionProblem', () => {
  it('requires a reason', () => {
    expect(retractionProblem('')).toMatch(/why/);
    expect(retractionProblem(undefined)).toMatch(/why/);
    expect(retractionProblem('Wrong batch')).toBeNull();
  });

  it('caps the reason length', () => {
    expect(retractionProblem('x'.repeat(501))).toMatch(/under/);
  });
});

describe('effectiveNoteProduct', () => {
  it("files a batch note under the batch's product when none was given", () => {
    expect(effectiveNoteProduct(null, 'OGS')).toBe('OGS');
  });

  it('lets an explicitly chosen product win', () => {
    expect(effectiveNoteProduct('35s', 'OGS')).toBe('35s');
  });

  it('stays unfiled when neither has one', () => {
    expect(effectiveNoteProduct(null, null)).toBeNull();
    expect(effectiveNoteProduct(null, '  ')).toBeNull();
  });
});
