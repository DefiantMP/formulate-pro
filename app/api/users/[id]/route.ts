import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isUserRole, wouldRemoveLastAdmin } from '@/lib/auth';
import { getCurrentUser } from '@/lib/session';

async function requireAdmin() {
  const actor = await getCurrentUser();
  if (!actor) return { error: NextResponse.json({ error: 'Sign in first' }, { status: 401 }) };
  if (actor.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Only an admin can manage accounts.' }, { status: 403 }) };
  }
  return { actor };
}

async function activeAdminCount() {
  return prisma.user.count({ where: { role: 'admin', deletedAt: null } });
}

/**
 * Change a user's role. Admin only — this is the path that grants the
 * reviewer entitlement, which signup deliberately no longer does.
 *
 * An admin cannot demote themselves, and nobody can demote the last active
 * admin: an instance with no admin has no way to grant any role again. That
 * guard is also what keeps signup's "no active admin" bootstrap from being
 * reopened on purpose.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { actor, error } = await requireAdmin();
  if (error) return error;

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
  if (body.role !== 'admin' && wouldRemoveLastAdmin(target.role, await activeAdminCount())) {
    return NextResponse.json({ error: 'This is the last admin — promote another admin first.' }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: { role: body.role },
    select: { id: true, name: true, email: true, role: true },
  });
  return NextResponse.json(user);
}

/**
 * Deactivate an account. A soft delete, never a real one: an account that
 * signed a batch record, weighed an ingredient or changed GMP mode is
 * referenced by those records, and erasing it would orphan the signature.
 * Deactivation ends the account's sessions and cancels any outstanding
 * reset link.
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { actor, error } = await requireAdmin();
  if (error) return error;

  const target = await prisma.user.findFirst({ where: { id: params.id, deletedAt: null } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.id === actor.id) {
    return NextResponse.json({ error: 'You cannot deactivate your own account.' }, { status: 400 });
  }
  if (wouldRemoveLastAdmin(target.role, await activeAdminCount())) {
    return NextResponse.json({ error: 'This is the last admin — promote another admin first.' }, { status: 400 });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { deletedAt: now, sessionsValidFrom: now } }),
    prisma.passwordResetToken.updateMany({
      where: { userId: target.id, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  return NextResponse.json({ id: target.id, deactivated: true });
}
