import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';
import { getCurrentUser, requireUser } from '@/lib/session';
import { getGmpSettings } from '@/lib/gmpSettings';
import { classifyImport, readDocx, readTextFile } from '@/lib/importFiles';
import { extractFormulation, transcribeNote } from '@/lib/documentReading';

/**
 * Step one of an import: store the original and read it. NOTHING is saved as
 * a note or formulation here — the reading goes back to the browser for a
 * person to check and correct, and only their reviewed version is saved (by
 * the ordinary lab-notes / saved-formulations routes, pointing back at the
 * stored original).
 *
 * Text and Word files are read verbatim with no AI. Images and PDFs go to the
 * model: transcribed for notes, structured for formulations.
 *
 * Form fields: file, purpose ('note' | 'formulation').
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const purpose = form?.get('purpose');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file to import.' }, { status: 400 });
  if (purpose !== 'note' && purpose !== 'formulation') {
    return NextResponse.json({ error: "purpose must be 'note' or 'formulation'" }, { status: 400 });
  }

  const gmp = await getGmpSettings();
  let uploaderId: string | null = null;
  if (gmp.enabled) {
    const who = await requireUser();
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: 401 });
    uploaderId = who.user.id;
  } else {
    uploaderId = (await getCurrentUser())?.id ?? null;
  }

  const kind = classifyImport(file.name, file.type, file.size);
  if (!kind.ok) return NextResponse.json({ error: kind.error }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());

  // A formulation from a plain text or Word file still needs structuring,
  // and the model can only read those as text — handled below.
  let text: string | null = null;
  if (kind.kind === 'text') text = readTextFile(bytes);
  if (kind.kind === 'docx') {
    try {
      text = readDocx(bytes);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  }
  if (text !== null && !text.trim()) return NextResponse.json({ error: 'That file has no text in it.' }, { status: 400 });

  const needsModel = purpose === 'formulation' || kind.kind === 'image' || kind.kind === 'pdf';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (needsModel && !apiKey) {
    return NextResponse.json({ error: 'Reading this file needs the AI, and no API key is configured.' }, { status: 500 });
  }

  // Store the original first: whatever the reading says, the source must
  // survive. De-duplicated by content, so re-reading a file after a failed
  // attempt does not pile up copies.
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const attachment =
    (await prisma.attachment.findFirst({ where: { sha256 }, select: { id: true } })) ??
    (await prisma.attachment.create({
      data: {
        filename: file.name,
        mediaType: kind.mediaType,
        sizeBytes: bytes.byteLength,
        sha256,
        data: Buffer.from(bytes),
        uploadedById: uploaderId,
      },
      select: { id: true },
    }));

  const base = { attachmentId: attachment.id, filename: file.name, kind: kind.kind };

  if (purpose === 'note') {
    if (text !== null) return NextResponse.json({ ...base, method: 'text_file', text, illegibleCount: 0, reviewHints: [] });
    const client = new Anthropic({ apiKey: apiKey! });
    const r = await transcribeNote(
      { kind: kind.kind as 'image' | 'pdf', mediaType: kind.mediaType, base64: Buffer.from(bytes).toString('base64') },
      (p) => client.messages.create(p)
    );
    if (!r.ok) return NextResponse.json({ ...base, error: r.error }, { status: r.status });
    return NextResponse.json({ ...base, method: 'transcribed', ...r.result });
  }

  // Formulation: the model structures every kind — text and Word files as
  // the text read from them, images and PDFs as themselves.
  const client = new Anthropic({ apiKey: apiKey! });
  const r = await extractFormulation(
    text !== null
      ? { kind: 'text', text }
      : { kind: kind.kind as 'image' | 'pdf', mediaType: kind.mediaType, base64: Buffer.from(bytes).toString('base64') },
    (p) => client.messages.create(p)
  );
  if (!r.ok) return NextResponse.json({ ...base, error: r.error }, { status: r.status });
  return NextResponse.json({ ...base, method: text !== null ? 'text_file' : 'transcribed', formulation: r.result });
}
