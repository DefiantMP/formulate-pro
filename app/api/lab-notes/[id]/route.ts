import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, requireUser } from '@/lib/session';
import { getGmpSettings } from '@/lib/gmpSettings';
import { retractionProblem } from '@/lib/labNotes';

/**
 * Retract a note. The ONLY write on an existing note: there is deliberately
 * no edit and no delete (see lib/labNotes.ts). Retraction is terminal — a
 * retracted note cannot be un-retracted or retracted again; write a new one.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const problem = retractionProblem(body?.retractReason);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const gmp = await getGmpSettings();
  let retractedById: string | null = null;
  if (gmp.enabled) {
    const who = await requireUser();
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: 401 });
    retractedById = who.user.id;
  } else {
    retractedById = (await getCurrentUser())?.id ?? null;
  }

  // Conditional on not already retracted, so two retractions cannot race.
  const result = await prisma.labNote.updateMany({
    where: { id: params.id, retractedAt: null },
    data: { retractedAt: new Date(), retractedReason: String(body.retractReason).trim(), retractedById },
  });
  if (result.count === 0) {
    const exists = await prisma.labNote.findUnique({ where: { id: params.id }, select: { id: true } });
    return NextResponse.json(
      { error: exists ? 'This note is already retracted.' : 'Note not found.' },
      { status: exists ? 409 : 404 }
    );
  }
  const note = await prisma.labNote.findUnique({
    where: { id: params.id },
    include: {
      author: { select: { name: true } },
      retractedBy: { select: { name: true } },
      run: { select: { id: true, label: true, product: true, createdAt: true } },
      attachment: { select: { id: true, filename: true, mediaType: true } },
    },
  });
  return NextResponse.json(note);
}
