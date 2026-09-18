import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

/** Cancel a pending invite. Kept, marked revoked, as the record it existed. */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  if (actor.role !== 'admin') return NextResponse.json({ error: 'Only an admin can manage invites.' }, { status: 403 });
  const r = await prisma.invite.updateMany({
    where: { id: params.id, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (r.count === 0) return NextResponse.json({ error: 'No pending invite with that id' }, { status: 404 });
  return NextResponse.json({ id: params.id, revoked: true });
}
