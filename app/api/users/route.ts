import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

/** Admin-only: the account list backing role management. Password hashes are
 *  never selected, so they cannot leak through this endpoint. */
export async function GET(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Admins only.' }, { status: 403 });
  }
  // ?include=deactivated adds deactivated accounts, for reactivation.
  const includeDeactivated = request.nextUrl.searchParams.get('include') === 'deactivated';
  const users = await prisma.user.findMany({
    where: includeDeactivated ? {} : { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, role: true, createdAt: true, deletedAt: true },
  });
  return NextResponse.json(users);
}
