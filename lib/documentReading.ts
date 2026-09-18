import type Anthropic from '@anthropic-ai/sdk';
import type { AnthropicMessageCreator } from './chat';

/**
 * AI reading of uploaded images and PDFs — handwritten notes and formulation
 * sheets. Same shape as lib/scaleVerification.ts: a forced tool call gives a
 * structured answer, the client is injectable for tests, and the model only
 * READS. Nothing it returns is saved until a person has reviewed it
 * (the import screens), and formulation numbers are then cross-checked by
 * code against the sheet's own grams where the sheet has them.
 */

/** An image or PDF (base64), or plain text already read from a .txt/.docx. */
export type DocumentInput =
  | { kind: 'image' | 'pdf'; mediaType: string; base64: string }
  | { kind: 'text'; text: string };

const MODEL = 'claude-sonnet-5';

function sourceBlock(doc: DocumentInput): Anthropic.ContentBlockParam {
  if (doc.kind === 'text') return { type: 'document', source: { type: 'text', media_type: 'text/plain', data: doc.text } };
  return doc.kind === 'pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: doc.base64 } }
    : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: doc.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
          data: doc.base64,
        },
      };
}

async function callTool<T>(
  doc: DocumentInput,
  system: string,
  instruction: string,
  tool: Anthropic.Tool,
  createMessage: AnthropicMessageCreator
): Promise<{ ok: true; input: T } | { ok: false; error: string; status: number }> {
  let response: Anthropic.Message;
  try {
    response = await createMessage({
      model: MODEL,
      max_tokens: 4096,
      system,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: [sourceBlock(doc), { type: 'text', text: instruction }] }],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, error: `Reading the document failed: ${message}`, status: 502 };
  }
  const use = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === tool.name
  );
  if (!use) return { ok: false, error: 'The document could not be read.', status: 502 };
  return { ok: true, input: use.input as T };
}

/* ---------------------------------------------------------------- notes */

export interface NoteTranscription {
  text: string;
  /** Places the model could not read, marked [illegible] in the text. */
  illegibleCount: number;
  /** Anything the reviewer should double-check — a smudged number, say. */
  reviewHints: string[];
}

const NOTE_SYSTEM = `You transcribe notes from a tablet-manufacturing lab — often handwritten — for a person who will check your transcription against the original before it is saved.

Transcribe EXACTLY what is written. Do not correct spelling, finish sentences, reorder, summarise or add anything. Keep numbers, units, dates, batch codes and abbreviations precisely as written: a misread number in a lab record is worse than a gap. Where a word or number cannot be read with confidence, write [illegible] in its place rather than guessing. Preserve line breaks and list structure. If the page is not a note (blank, or a photo of something else), return empty text and say so in reviewHints.`;

const noteTool: Anthropic.Tool = {
  name: 'report_transcription',
  description: 'Report the verbatim transcription of the note.',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Verbatim transcription, [illegible] for unreadable parts.' },
      illegibleCount: { type: 'integer', description: 'How many [illegible] markers the text contains.' },
      reviewHints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific things the reviewer should double-check, e.g. "the 5 in 0.58 g could be a 6".',
      },
    },
    required: ['text', 'illegibleCount', 'reviewHints'],
    additionalProperties: false,
  },
};

export async function transcribeNote(
  doc: DocumentInput,
  createMessage: AnthropicMessageCreator
): Promise<{ ok: true; result: NoteTranscription } | { ok: false; error: string; status: number }> {
  const r = await callTool<Partial<NoteTranscription>>(doc, NOTE_SYSTEM, 'Transcribe this note.', noteTool, createMessage);
  if (!r.ok) return r;
  return parseNoteTranscription(r.input);
}

export function parseNoteTranscription(
  input: Partial<NoteTranscription>
): { ok: true; result: NoteTranscription } | { ok: false; error: string; status: number } {
  if (typeof input.text !== 'string') return { ok: false, error: 'The transcription came back malformed.', status: 502 };
  const hints = Array.isArray(input.reviewHints) ? input.reviewHints.filter((h): h is string => typeof h === 'string') : [];
  // Counted from the text rather than trusted: the marker count is what the
  // reviewer sees, so it is what the warning must match.
  const illegibleCount = (input.text.match(/\[illegible\]/gi) ?? []).length;
  return { ok: true, result: { text: input.text.trim(), illegibleCount, reviewHints: hints } };
}

/* --------------------------------------------------------- formulations */

export interface ExtractedActive {
  label: string;
  targetMgPerTablet: number | null;
  /** 0-100 */
  potencyPercent: number | null;
}

export interface ExtractedExcipient {
  name: string;
  percentOfBlend: number | null;
  role: 'disintegrant' | 'lubricant' | 'glidant' | 'other';
}

export interface ExtractedFormulation {
  name: string | null;
  tabletWeightG: number | null;
  referenceBatchTablets: number | null;
  actives: ExtractedActive[];
  fillerName: string | null;
  excipients: ExtractedExcipient[];
  /** The grams the sheet itself lists, when it lists any — used to cross-check the reading. */
  sheetGrams: { name: string; grams: number }[];
  sheetTotalGrams: number | null;
  notes: string | null;
  /** Fields the model was unsure of, for the reviewer. */
  uncertainFields: string[];
}

const FORMULATION_SYSTEM = `You read tablet formulation sheets — printed, exported spreadsheets, or handwritten — for a person who will check every value before it is saved, and whose numbers will then be cross-checked by calculation.

Report only what the sheet actually states. Use null for any number you cannot read with confidence or that the sheet does not give — never estimate, compute or fill in a "typical" value. Percentages are percent of the total blend, 0-100 (a sheet showing 0.04 or 4% means 4). Potency is the raw material's active content in percent. The filler is the ingredient that makes up the balance of the blend (often Emdex, Dipac or EZTAB); list every OTHER non-active ingredient as an excipient with its role. If the sheet lists gram amounts per ingredient, report them exactly as printed in sheetGrams, and the total in sheetTotalGrams. Put free-text notes, SOP remarks and changes ("adjusted PVPP from 5% to 4%") in notes. List anything you were unsure about in uncertainFields.`;

const num = { type: ['number', 'null'] };
const formulationTool: Anthropic.Tool = {
  name: 'report_formulation',
  description: 'Report the formulation exactly as the sheet states it.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: ['string', 'null'] },
      tabletWeightG: { ...num, description: 'Tablet weight in grams.' },
      referenceBatchTablets: { ...num, description: 'Tablets per batch/run.' },
      actives: {
        type: 'array',
        items: {
          type: 'object',
          properties: { label: { type: 'string' }, targetMgPerTablet: num, potencyPercent: num },
          required: ['label', 'targetMgPerTablet', 'potencyPercent'],
          additionalProperties: false,
        },
      },
      fillerName: { type: ['string', 'null'] },
      excipients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            percentOfBlend: num,
            role: { type: 'string', enum: ['disintegrant', 'lubricant', 'glidant', 'other'] },
          },
          required: ['name', 'percentOfBlend', 'role'],
          additionalProperties: false,
        },
      },
      sheetGrams: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, grams: { type: 'number' } },
          required: ['name', 'grams'],
          additionalProperties: false,
        },
      },
      sheetTotalGrams: num,
      notes: { type: ['string', 'null'] },
      uncertainFields: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'name', 'tabletWeightG', 'referenceBatchTablets', 'actives', 'fillerName',
      'excipients', 'sheetGrams', 'sheetTotalGrams', 'notes', 'uncertainFields',
    ],
    additionalProperties: false,
  },
};

export async function extractFormulation(
  doc: DocumentInput,
  createMessage: AnthropicMessageCreator
): Promise<{ ok: true; result: ExtractedFormulation } | { ok: false; error: string; status: number }> {
  const r = await callTool<Record<string, unknown>>(
    doc,
    FORMULATION_SYSTEM,
    'Read this formulation sheet.',
    formulationTool,
    createMessage
  );
  if (!r.ok) return r;
  return parseExtractedFormulation(r.input);
}

const positiveOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
/** A percentage that must be 0-100. Anything else is treated as unread, not clamped. */
const percentOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Validates the model's reading. Out-of-range numbers become null (shown to
 * the reviewer as "not read") rather than being clamped into something
 * plausible — a clamped misread looks like a real value.
 */
export function parseExtractedFormulation(
  input: Record<string, unknown>
): { ok: true; result: ExtractedFormulation } | { ok: false; error: string; status: number } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'The reading came back malformed.', status: 502 };
  }
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const roles = ['disintegrant', 'lubricant', 'glidant', 'other'] as const;
  const result: ExtractedFormulation = {
    name: str(input.name),
    tabletWeightG: positiveOrNull(input.tabletWeightG),
    referenceBatchTablets:
      typeof input.referenceBatchTablets === 'number' && Number.isFinite(input.referenceBatchTablets) && input.referenceBatchTablets > 0
        ? Math.round(input.referenceBatchTablets)
        : null,
    actives: arr(input.actives)
      .map((a: Record<string, unknown>) => ({
        label: str(a?.label) ?? '',
        targetMgPerTablet: positiveOrNull(a?.targetMgPerTablet),
        potencyPercent: percentOrNull(a?.potencyPercent) || null,
      }))
      .filter((a) => a.label),
    fillerName: str(input.fillerName),
    excipients: arr(input.excipients)
      .map((e: Record<string, unknown>) => ({
        name: str(e?.name) ?? '',
        percentOfBlend: percentOrNull(e?.percentOfBlend),
        role: (roles as readonly string[]).includes(e?.role as string) ? (e.role as ExtractedExcipient['role']) : 'other',
      }))
      .filter((e) => e.name),
    sheetGrams: arr(input.sheetGrams)
      .map((g: Record<string, unknown>) => ({ name: str(g?.name) ?? '', grams: typeof g?.grams === 'number' ? g.grams : NaN }))
      .filter((g) => g.name && Number.isFinite(g.grams) && g.grams >= 0),
    sheetTotalGrams: positiveOrNull(input.sheetTotalGrams),
    notes: str(input.notes),
    uncertainFields: arr(input.uncertainFields).filter((f): f is string => typeof f === 'string'),
  };
  return { ok: true, result };
}
