/**
 * Lab notes — pure rules, DB-free like lib/gmp.ts.
 *
 * A note is a dated entry in the lab's shared notebook, optionally filed
 * against a product and/or one specific batch. Notes are INTERNAL: they record
 * trial-and-error, client remarks and floor problems, and must never be shown
 * to a client, whatever client access the app grows later.
 *
 * No editing, by design — the same rule as LotAdjustment. A notebook whose
 * entries can be silently rewritten stops being a record of what was known
 * when. A wrong note is RETRACTED with a reason and a correct one written;
 * the retracted note stays visible, struck through, with who retracted it
 * and why.
 */

export const LAB_NOTE_MAX_LENGTH = 5000;
export const RETRACTION_REASON_MAX_LENGTH = 500;

export interface LabNoteInput {
  body: unknown;
  product?: unknown;
  runId?: unknown;
  source?: unknown;
  attachmentId?: unknown;
}

/** How a note's text got into the notebook. */
export type LabNoteSource = 'typed' | 'text_file' | 'transcribed';
export const LAB_NOTE_SOURCES: readonly LabNoteSource[] = ['typed', 'text_file', 'transcribed'];

export interface CleanLabNote {
  body: string;
  product: string | null;
  runId: string | null;
  source: LabNoteSource;
  attachmentId: string | null;
}

/** Validates and normalises a new note, or says what is wrong with it. */
export function parseLabNote(input: LabNoteInput): { ok: true; value: CleanLabNote } | { ok: false; error: string } {
  if (typeof input.body !== 'string' || !input.body.trim()) {
    return { ok: false, error: 'A note needs some text.' };
  }
  const body = input.body.trim();
  if (body.length > LAB_NOTE_MAX_LENGTH) {
    return { ok: false, error: `Notes are limited to ${LAB_NOTE_MAX_LENGTH.toLocaleString()} characters.` };
  }
  if (input.product !== undefined && input.product !== null && typeof input.product !== 'string') {
    return { ok: false, error: 'product must be text.' };
  }
  if (input.runId !== undefined && input.runId !== null && (typeof input.runId !== 'string' || !input.runId.trim())) {
    return { ok: false, error: 'runId must be a run id.' };
  }
  const product = typeof input.product === 'string' && input.product.trim() ? input.product.trim() : null;
  const runId = typeof input.runId === 'string' ? input.runId.trim() : null;
  const source = input.source === undefined ? 'typed' : input.source;
  if (!(LAB_NOTE_SOURCES as readonly unknown[]).includes(source)) {
    return { ok: false, error: `source must be one of ${LAB_NOTE_SOURCES.join(', ')}.` };
  }
  // An imported note must point at its original; a typed one has none.
  const attachmentId = typeof input.attachmentId === 'string' && input.attachmentId.trim() ? input.attachmentId.trim() : null;
  if (source !== 'typed' && !attachmentId) {
    return { ok: false, error: 'An imported note must keep its original file.' };
  }
  if (source === 'typed' && attachmentId) {
    return { ok: false, error: 'A typed note has no original file.' };
  }
  return { ok: true, value: { body, product, runId, source: source as LabNoteSource, attachmentId } };
}

/** A retraction must say why — "retracted" with no reason is not a record. */
export function retractionProblem(reason: unknown): string | null {
  if (typeof reason !== 'string' || !reason.trim()) return 'Say why the note is being retracted.';
  if (reason.trim().length > RETRACTION_REASON_MAX_LENGTH) {
    return `Keep the reason under ${RETRACTION_REASON_MAX_LENGTH} characters.`;
  }
  return null;
}

/**
 * The product a note is filed under. A note attached to a batch takes that
 * batch's product when none was given, so it also appears on the product's
 * page — filing it twice by hand would be easy to forget. An explicitly given
 * product wins.
 */
export function effectiveNoteProduct(given: string | null, runProduct: string | null | undefined): string | null {
  if (given) return given;
  const fromRun = runProduct?.trim();
  return fromRun ? fromRun : null;
}
