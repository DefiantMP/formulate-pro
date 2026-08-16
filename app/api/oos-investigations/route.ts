import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { OOS_DISPOSITIONS, isOosDisposition } from '@/lib/lotSpecStatus';

/** ?lotId= scopes to one lot; ?disposition= filters; ?open=true returns only
 *  unapproved (still-open) investigations. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lotId = sp.get('lotId');
  const disposition = sp.get('disposition');
  const open = sp.get('open');

  if (disposition && !isOosDisposition(disposition)) {
    return NextResponse.json(
      { error: `disposition must be one of ${OOS_DISPOSITIONS.join(', ')}` },
      { status: 400 }
    );
  }

  const investigations = await prisma.oosInvestigation.findMany({
    where: {
      ...(lotId ? { lotId } : {}),
      ...(disposition ? { disposition } : {}),
      ...(open === 'true' ? { approvedAt: null } : {}),
    },
    orderBy: { openedAt: 'desc' },
    include: {
      lot: { select: { id: true, lotLabel: true, rawMaterial: { select: { name: true } } } },
      failedLotSpecTest: {
        select: {
          id: true,
          resultValue: true,
          resultText: true,
          testedAt: true,
          specCriterion: { select: { id: true, parameterName: true } },
        },
      },
    },
  });
  return NextResponse.json(investigations);
}

/**
 * Open an investigation against a specific failing result.
 *
 * Two integrity checks that the schema alone can't enforce:
 *  - the referenced test must actually have failed. An investigation is by
 *    definition the record of an out-of-spec result; one opened against a
 *    passing test could later be approved as invalidate_original_result and
 *    sit there implying a failure was cleared that never happened.
 *  - lotId must match the lot the referenced test belongs to. Both FKs exist
 *    on this row, so they can disagree; a mismatch would file the
 *    investigation under a lot whose status it has no bearing on, while the
 *    lot that actually failed stays failed with no visible open case.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { lotId, failedLotSpecTestId, openedBy, openedAt, reasonForInvestigation, notes } = body;

  if (typeof lotId !== 'string' || !lotId.trim()) {
    return NextResponse.json({ error: 'lotId is required' }, { status: 400 });
  }
  if (typeof failedLotSpecTestId !== 'string' || !failedLotSpecTestId.trim()) {
    return NextResponse.json({ error: 'failedLotSpecTestId is required' }, { status: 400 });
  }
  if (typeof openedBy !== 'string' || !openedBy.trim()) {
    return NextResponse.json({ error: 'openedBy is required' }, { status: 400 });
  }
  if (typeof reasonForInvestigation !== 'string' || !reasonForInvestigation.trim()) {
    return NextResponse.json({ error: 'reasonForInvestigation is required' }, { status: 400 });
  }
  if (notes !== null && notes !== undefined && typeof notes !== 'string') {
    return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 });
  }

  const opened = openedAt === undefined ? new Date() : new Date(openedAt);
  if (Number.isNaN(opened.getTime())) {
    return NextResponse.json({ error: 'openedAt must be a valid date' }, { status: 400 });
  }

  const failedTest = await prisma.lotSpecTest.findUnique({ where: { id: failedLotSpecTestId } });
  if (!failedTest) {
    return NextResponse.json({ error: 'Failed spec test not found' }, { status: 404 });
  }
  if (failedTest.lotId !== lotId) {
    return NextResponse.json(
      { error: 'lotId does not match the lot of the referenced failedLotSpecTestId' },
      { status: 400 }
    );
  }
  if (failedTest.passFail) {
    return NextResponse.json(
      { error: 'An OOS investigation can only be opened against a failing test result' },
      { status: 400 }
    );
  }

  const investigation = await prisma.oosInvestigation.create({
    data: {
      lotId,
      failedLotSpecTestId,
      openedBy: openedBy.trim(),
      openedAt: opened,
      reasonForInvestigation: reasonForInvestigation.trim(),
      // Opens undecided: no findings, no retest judgment, no disposition,
      // unapproved. Nothing about a newly opened investigation affects the
      // lot's status until it is both dispositioned and approved.
      disposition: 'pending',
      notes: notes ?? null,
    },
  });

  return NextResponse.json(investigation, { status: 201 });
}
