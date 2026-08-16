import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { OOS_DISPOSITIONS, isOosDisposition } from '@/lib/lotSpecStatus';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const investigation = await prisma.oosInvestigation.findUnique({
    where: { id: params.id },
    include: {
      lot: { select: { id: true, lotLabel: true, rawMaterial: { select: { name: true } } } },
      failedLotSpecTest: { include: { specCriterion: true } },
    },
  });
  if (!investigation) {
    return NextResponse.json({ error: 'Investigation not found' }, { status: 404 });
  }
  return NextResponse.json(investigation);
}

/**
 * Work an investigation and close it out. Partial update, same shape as
 * PATCH /api/runs/[id]: only fields present in the body are written.
 *
 * Editable while open: rootCauseFindings, retestJustified, disposition,
 * notes.
 *
 * Approval: send { approvedBy }. approvedAt is stamped SERVER-SIDE in the
 * same write — the two are never settable independently, so an investigation
 * can't end up approved-with-no-approver or timestamped-with-no-signer.
 * A client-supplied approvedAt is rejected rather than ignored, so nobody
 * believes they backdated an approval that in fact recorded as now.
 *
 * Approval is terminal: an approved investigation is the thing that can
 * clear a failed lot, so it's frozen afterwards rather than editable — the
 * same "cannot edit an already-approved record" rule as
 * PATCH /api/scale-verifications/[id]. Reopening means opening a new
 * investigation against the same failing test, which the rollup handles
 * (it accepts any qualifying investigation on a test).
 *
 * lotId and failedLotSpecTestId are NOT editable: they're the anchor the
 * lot/test agreement was validated against at open time, and re-pointing
 * them is indistinguishable from filing a fresh investigation.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { rootCauseFindings, retestJustified, disposition, notes, approvedBy, approvedAt } = body;

  if ('lotId' in body || 'failedLotSpecTestId' in body) {
    return NextResponse.json(
      { error: 'lotId and failedLotSpecTestId cannot be changed; open a new investigation instead' },
      { status: 400 }
    );
  }
  if ('approvedAt' in body && approvedAt !== undefined) {
    return NextResponse.json(
      { error: 'approvedAt is set by the server; send approvedBy to approve' },
      { status: 400 }
    );
  }
  if (
    rootCauseFindings !== null &&
    rootCauseFindings !== undefined &&
    typeof rootCauseFindings !== 'string'
  ) {
    return NextResponse.json({ error: 'rootCauseFindings must be a string or null' }, { status: 400 });
  }
  if (retestJustified !== null && retestJustified !== undefined && typeof retestJustified !== 'boolean') {
    return NextResponse.json({ error: 'retestJustified must be a boolean or null' }, { status: 400 });
  }
  if (disposition !== undefined && !isOosDisposition(disposition)) {
    return NextResponse.json(
      { error: `disposition must be one of ${OOS_DISPOSITIONS.join(', ')}` },
      { status: 400 }
    );
  }
  if (notes !== null && notes !== undefined && typeof notes !== 'string') {
    return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 });
  }
  if (approvedBy !== undefined && (typeof approvedBy !== 'string' || !approvedBy.trim())) {
    return NextResponse.json({ error: 'approvedBy must be a non-empty string' }, { status: 400 });
  }

  const existing = await prisma.oosInvestigation.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: 'Investigation not found' }, { status: 404 });
  }
  if (existing.approvedAt !== null) {
    return NextResponse.json(
      { error: 'Cannot edit an already-approved investigation' },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if ('rootCauseFindings' in body) data.rootCauseFindings = rootCauseFindings ?? null;
  if ('retestJustified' in body) data.retestJustified = retestJustified ?? null;
  if (disposition !== undefined) data.disposition = disposition;
  if ('notes' in body) data.notes = notes ?? null;

  if (approvedBy !== undefined) {
    const finalDisposition = (data.disposition as string | undefined) ?? existing.disposition;
    if (finalDisposition === 'pending') {
      return NextResponse.json(
        { error: 'Set a disposition other than "pending" before approving' },
        { status: 400 }
      );
    }
    // An investigation is only closed once approved, and a closed one has to
    // state what it concluded — approving with no root cause recorded leaves
    // an audit trail that can't explain itself.
    const finalFindings = ('rootCauseFindings' in data
      ? data.rootCauseFindings
      : existing.rootCauseFindings) as string | null;
    if (!finalFindings || !finalFindings.trim()) {
      return NextResponse.json(
        { error: 'rootCauseFindings is required before approving' },
        { status: 400 }
      );
    }
    // Both halves in the same write — see isInvalidatingInvestigation, which
    // requires both before it will honor any disposition.
    data.approvedBy = approvedBy.trim();
    data.approvedAt = new Date();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Unsupported update' }, { status: 400 });
  }

  const investigation = await prisma.oosInvestigation.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json(investigation);
}
