import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  // Deliberately not filtered on deletedAt — an archived formulation is
  // still reachable by direct link (e.g. from a still-visible child
  // version's Iterate history), just excluded from the library list.
  const formulation = await prisma.savedFormulation.findUnique({ where: { id: params.id } });
  if (!formulation) {
    return NextResponse.json({ error: 'Formulation not found' }, { status: 404 });
  }
  return NextResponse.json(formulation);
}

/**
 * Soft delete — sets deletedAt rather than removing the row. A hard delete
 * is unsafe here: this row may be a lineage root or parent that other
 * versions' parentId still points to (see the self-relation on
 * SavedFormulation), so removing it would either fail the FK constraint or
 * dangle a child's parent reference. Idempotent, same as DELETE
 * /api/runs/[id].
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.savedFormulation.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Formulation not found' }, { status: 404 });
  }
}
