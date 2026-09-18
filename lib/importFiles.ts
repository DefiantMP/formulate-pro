import { unzipSync, strFromU8 } from 'fflate';

/**
 * What an uploaded file is, and the text that can be read from it WITHOUT AI.
 *
 * Text and Word files are read exactly as written — no model in the loop, so
 * nothing can be misread. Only images and PDFs (handwriting, scans, exported
 * sheets) need transcription, which lives in lib/documentReading.ts and always
 * goes to a person for review before anything is saved.
 */

export type ImportKind = 'image' | 'pdf' | 'text' | 'docx';

/** Anthropic's accepted image types. HEIC is deliberately absent: the API
 *  rejects it, so it is refused here with a message saying what to do. */
export const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Classifies by extension first — browsers report empty or generic types
 *  for .md and sometimes .docx — then by media type. */
export function classifyImport(
  filename: string,
  mediaType: string,
  sizeBytes: number
): { ok: true; kind: ImportKind; mediaType: string } | { ok: false; error: string } {
  if (sizeBytes <= 0) return { ok: false, error: 'That file is empty.' };
  if (sizeBytes > MAX_IMPORT_BYTES) {
    return { ok: false, error: `Files are limited to ${MAX_IMPORT_BYTES / 1024 / 1024} MB.` };
  }
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const type = mediaType.toLowerCase();

  if (ext === 'heic' || ext === 'heif' || type === 'image/heic' || type === 'image/heif') {
    return {
      ok: false,
      error: 'iPhone HEIC photos can’t be read. Share the photo as JPEG (or take a screenshot) and upload that.',
    };
  }
  if (ext === 'txt' || ext === 'md' || ext === 'markdown' || type === 'text/plain' || type === 'text/markdown') {
    return { ok: true, kind: 'text', mediaType: 'text/plain' };
  }
  if (ext === 'docx' || type === DOCX_TYPE) return { ok: true, kind: 'docx', mediaType: DOCX_TYPE };
  if (ext === 'doc') {
    return { ok: false, error: 'Old .doc files can’t be read. Save it as .docx (or PDF) and upload that.' };
  }
  if (ext === 'pdf' || type === 'application/pdf') return { ok: true, kind: 'pdf', mediaType: 'application/pdf' };

  const imageByExt: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  const imageType = imageByExt[ext] ?? ((IMAGE_MEDIA_TYPES as readonly string[]).includes(type) ? type : null);
  if (imageType) return { ok: true, kind: 'image', mediaType: imageType };

  return { ok: false, error: 'Upload a photo (JPEG/PNG), PDF, Word (.docx) or text (.txt/.md) file.' };
}

/** Plain text, with Windows line endings and a byte-order mark cleaned off. */
export function readTextFile(bytes: Uint8Array): string {
  return strFromU8(bytes).replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
}

/**
 * The text of a .docx: every paragraph from word/document.xml, in order.
 * Tables come out one cell per line. Formatting, images and comments are
 * dropped — the attached original keeps them.
 */
export function readDocx(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
  } catch {
    throw new Error('That Word file could not be opened — it may be damaged or password-protected.');
  }
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('That file is not a readable Word document.');
  const doc = strFromU8(xml);
  const paragraphs = doc.split(/<\/w:p>/).map((p) => {
    const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
      .map((m) => (m[0] === '<w:tab/>' ? '\t' : m[0] === '<w:br/>' ? '\n' : m[1]))
      .join('');
    return decodeXml(text);
  });
  return paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}
