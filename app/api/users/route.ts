import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

/** Admin-only: the account list backing role management. Password hashes are
 *  never selected, so they cannot leak through this endpoint. */
export async function GET() {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Admins only.' }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return NextResponse.json(users);
}
