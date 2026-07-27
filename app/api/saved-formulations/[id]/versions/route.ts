import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { effectiveLineageId } from '@/lib/savedFormulations';

/**
 * Returns the full version chain (oldest to newest) for the formulation
 * lineage that `params.id` belongs to — not just that one row. Resolves the
 * target's effective lineage id (falling back to its own id for a lineage
 * root, see effectiveLineageId) and matches every row that either shares
 * that lineageId or IS that root (whose own lineageId column is null).
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const target = await prisma.savedFormulation.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: 'Formulation not found' }, { status: 404 });
  }

  const lineageId = effectiveLineageId(target);
  const versions = await prisma.savedFormulation.findMany({
    where: { OR: [{ lineageId }, { id: lineageId }] },
    orderBy: { version: 'asc' },
  });

  return NextResponse.json(versions);
}
