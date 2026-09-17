import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

/**
 * Reactivate a deactivated account. Admin only. The account keeps the role
 * it had — shown next to the button, and changeable straight after — and its
 * sessions from before deactivation stay ended: sessionsValidFrom is left as
 * deactivation set it, so the person signs in again.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can reactivate accounts.' }, { status: 403 });
  }
  const target = await prisma.user.findFirst({ where: { id: params.id, deletedAt: { not: null } } });
  if (!target) return NextResponse.json({ error: 'No deactivated account with that id' }, { status: 404 });

  const user = await prisma.user.update({
    where: { id: target.id },
    data: { deletedAt: null },
    select: { id: true, name: true, email: true, role: true },
  });
  return NextResponse.json(user);
}
