import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isUserRole } from '@/lib/auth';
import { getCurrentUser } from '@/lib/session';

/**
 * Change a user's role. Admin only — this is the path that grants the
 * reviewer entitlement, which signup deliberately no longer does.
 *
 * An admin cannot demote themselves: dropping the last admin would leave an
 * instance with no way to grant any role again, recoverable only by editing
 * the database by hand.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can change roles.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !isUserRole(body.role)) {
    return NextResponse.json({ error: 'A valid role is required' }, { status: 400 });
  }

  const target = await prisma.user.findFirst({ where: { id: params.id, deletedAt: null } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (target.id === actor.id && body.role !== 'admin') {
    return NextResponse.json(
      { error: 'You cannot remove your own admin role — promote another admin first.' },
      { status: 400 }
    );
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: { role: body.role },
    select: { id: true, name: true, email: true, role: true },
  });
  return NextResponse.json(user);
}
