import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { deviationSubmissionError, isDeviationDisposition } from '@/lib/gmp';
import { getGmpSettings } from '@/lib/gmpSettings';
import { getCurrentUser } from '@/lib/session';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const deviations = await prisma.runDeviation.findMany({
    where: { runId: params.id },
    orderBy: { openedAt: 'desc' },
  });
  return NextResponse.json(deviations);
}

/**
 * Open a deviation against a batch.
 *
 * Deliberately allowed with GMP mode off as well: the mode decides whether a
 * deviation is REQUIRED for an out-of-spec batch, not whether an operator may
 * choose to record one. Refusing to store a deviation someone took the
 * trouble to write would lose real information.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const { description, investigationFindings, disposition, justification } = body;

  if (typeof description !== 'string' || !description.trim()) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }
  const disp = disposition ?? 'pending';
  if (!isDeviationDisposition(disp)) {
    return NextResponse.json({ error: 'Unknown disposition' }, { status: 400 });
  }
  const problem = deviationSubmissionError(disp, justification);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  // With GMP mode on a deviation must be attributable; with it off an
  // anonymous record is still better than none, so it is allowed.
  const gmp = await getGmpSettings();
  const actor = await getCurrentUser();
  if (gmp.enabled && !actor) {
    return NextResponse.json(
      { error: 'GMP mode: sign in to record a deviation — it is attributed to your account.' },
      { status: 401 }
    );
  }

  const run = await prisma.run.findUnique({ where: { id: params.id } });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  const deviation = await prisma.runDeviation.create({
    data: {
      runId: params.id,
      description: description.trim(),
      investigationFindings:
        typeof investigationFindings === 'string' && investigationFindings.trim()
          ? investigationFindings.trim()
          : null,
      disposition: disp,
      justification:
        typeof justification === 'string' && justification.trim() ? justification.trim() : null,
      openedById: actor?.id ?? null,
    },
  });
  return NextResponse.json(deviation, { status: 201 });
}
