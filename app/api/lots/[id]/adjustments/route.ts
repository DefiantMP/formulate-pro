import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { adjustmentError } from '@/lib/lotAdjustment';
import { getGmpSettings } from '@/lib/gmpSettings';
import { getCurrentUser } from '@/lib/session';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const adjustments = await prisma.lotAdjustment.findMany({
    where: { lotId: params.id },
    orderBy: { adjustedAt: 'desc' },
    include: { adjustedBy: { select: { name: true } } },
  });
  return NextResponse.json(adjustments);
}

/**
 * Record a correction to a lot's remaining quantity.
 *
 * Append-only: there is no PATCH or DELETE here by design. A wrong adjustment
 * is corrected by a further adjustment in the opposite direction, so the log
 * shows what was believed and when it changed. Making the row editable would
 * throw that away and reintroduce exactly the silent-quantity problem this
 * table exists to fix.
 *
 * The row and the lot's running quantity are written in one transaction, so a
 * recorded correction can never fail to move the stock it explains.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const deltaG = typeof body.deltaG === 'number' ? body.deltaG : Number.NaN;
  const reason = typeof body.reason === 'string' ? body.reason : '';

  const lot = await prisma.lot.findUnique({ where: { id: params.id } });
  if (!lot) return NextResponse.json({ error: 'Lot not found' }, { status: 404 });

  const problem = adjustmentError({ deltaG, reason }, lot.quantityRemainingG);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  // Attributable when GMP mode is on, for the same reason every other GMP
  // write is: a stock correction nobody is accountable for is not a record.
  const settings = await getGmpSettings();
  const actor = await getCurrentUser();
  if (settings.enabled && !actor) {
    return NextResponse.json(
      { error: 'GMP mode: sign in to adjust stock — the correction is recorded against your account.' },
      { status: 401 }
    );
  }

  const [adjustment] = await prisma.$transaction([
    prisma.lotAdjustment.create({
      data: {
        lotId: params.id,
        deltaG,
        reason: reason.trim(),
        adjustedById: actor?.id ?? null,
      },
      include: { adjustedBy: { select: { name: true } } },
    }),
    prisma.lot.update({
      where: { id: params.id },
      data: { quantityRemainingG: { increment: deltaG } },
    }),
  ]);

  return NextResponse.json(adjustment, { status: 201 });
}
