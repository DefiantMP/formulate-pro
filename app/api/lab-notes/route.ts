import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, requireUser } from '@/lib/session';
import { getGmpSettings } from '@/lib/gmpSettings';
import { effectiveNoteProduct, parseLabNote } from '@/lib/labNotes';

const include = {
  author: { select: { name: true } },
  retractedBy: { select: { name: true } },
  run: { select: { id: true, label: true, product: true, createdAt: true } },
  attachment: { select: { id: true, filename: true, mediaType: true } },
} as const;

/**
 * The lab notebook. ?product= and ?runId= narrow it; with neither, every note,
 * newest first. Retracted notes are included — they are part of the record —
 * and the UI shows them struck through.
 *
 * Soft-deleted (archived) runs keep their notes; a note is not evidence that
 * should disappear because a run was archived.
 */
export async function GET(request: NextRequest) {
  const product = request.nextUrl.searchParams.get('product');
  const runId = request.nextUrl.searchParams.get('runId');
  const notes = await prisma.labNote.findMany({
    where: {
      ...(runId ? { runId } : {}),
      ...(product ? { product } : {}),
    },
    include,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return NextResponse.json(notes);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const parsed = parseLabNote(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // With GMP mode on, an entry must be attributable to an account — same
  // rule as every other GMP-era record. With it off, a signed-out note is
  // allowed and simply has no author.
  const gmp = await getGmpSettings();
  let authorId: string | null = null;
  if (gmp.enabled) {
    const who = await requireUser();
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: 401 });
    authorId = who.user.id;
  } else {
    authorId = (await getCurrentUser())?.id ?? null;
  }

  if (parsed.value.attachmentId) {
    const exists = await prisma.attachment.findUnique({ where: { id: parsed.value.attachmentId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: 'The uploaded original was not found.' }, { status: 400 });
  }

  let runProduct: string | null = null;
  if (parsed.value.runId) {
    const run = await prisma.run.findUnique({ where: { id: parsed.value.runId }, select: { product: true } });
    if (!run) return NextResponse.json({ error: 'That batch does not exist.' }, { status: 400 });
    runProduct = run.product;
  }

  const note = await prisma.labNote.create({
    data: {
      body: parsed.value.body,
      product: effectiveNoteProduct(parsed.value.product, runProduct),
      runId: parsed.value.runId,
      authorId,
      source: parsed.value.source,
      attachmentId: parsed.value.attachmentId,
    },
    include,
  });
  return NextResponse.json(note, { status: 201 });
}
