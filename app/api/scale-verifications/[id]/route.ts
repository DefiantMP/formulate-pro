import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { computePassFail, type ToleranceType } from '@/lib/scaleVerification';

/**
 * Two supported updates:
 * - { operatorReadingWeightG: number } — an operator correcting the AI's
 *   reading before manager review. aiReadingWeightG is left untouched;
 *   passFail is recomputed against the new operatorReadingWeightG. Blocked
 *   once approved, since the photo is gone by then and there's nothing left
 *   to re-check the correction against.
 * - { status: 'approved' } — deletes the stored photo (photoDataUrl -> null)
 *   but keeps every other field — readings, pass/fail, timestamps —
 *   permanently, per Phase 1's "discard the photo once approved" rule.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const existing = await prisma.scaleVerification.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: 'Verification not found' }, { status: 404 });
  }

  if (typeof body.operatorReadingWeightG === 'number') {
    if (existing.status === 'approved') {
      return NextResponse.json({ error: 'Cannot edit an already-approved verification' }, { status: 400 });
    }
    const passFail = computePassFail(
      existing.expectedWeightG,
      existing.toleranceType as ToleranceType,
      existing.toleranceValue,
      body.operatorReadingWeightG
    );
    const updated = await prisma.scaleVerification.update({
      where: { id: params.id },
      data: { operatorReadingWeightG: body.operatorReadingWeightG, passFail },
      include: { run: { select: { label: true } } },
    });
    return NextResponse.json(updated);
  }

  if (body.status === 'approved') {
    if (existing.status === 'approved') {
      return NextResponse.json({ error: 'Verification is already approved' }, { status: 400 });
    }
    const updated = await prisma.scaleVerification.update({
      where: { id: params.id },
      data: { status: 'approved', approvedAt: new Date(), photoDataUrl: null },
      include: { run: { select: { label: true } } },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: 'Unsupported update' }, { status: 400 });
}
