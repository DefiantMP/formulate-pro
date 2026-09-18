import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { generateResetToken, hashResetToken } from '@/lib/passwordReset';
import { INVITE_TTL_MS, isInvitableRole, normaliseInviteEmail } from '@/lib/invites';

async function requireAdmin() {
  const actor = await getCurrentUser();
  if (!actor) return { error: NextResponse.json({ error: 'Sign in first' }, { status: 401 }) };
  if (actor.role !== 'admin') return { error: NextResponse.json({ error: 'Only an admin can manage invites.' }, { status: 403 }) };
  return { actor };
}

/** Pending invites (not used, cancelled or expired), newest first. */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const invites = await prisma.invite.findMany({
    where: { usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, issuedBy: { select: { name: true } } },
  });
  return NextResponse.json(invites);
}

/**
 * Invite someone: { email, role }. Returns the one-time link — it is in this
 * response and nowhere else. A newer invite for the same email cancels any
 * older pending one, so there is only ever one live link per person.
 */
export async function POST(request: NextRequest) {
  const { actor, error } = await requireAdmin();
  if (error) return error;
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? normaliseInviteEmail(body.email) : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }
  if (!isInvitableRole(body?.role)) {
    return NextResponse.json({ error: 'Role must be operator or reviewer' }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { email }, select: { deletedAt: true } });
  if (existing) {
    return NextResponse.json(
      {
        error: existing.deletedAt
          ? 'That email belongs to a deactivated account — reactivate it instead.'
          : 'That email already has an account.',
      },
      { status: 409 }
    );
  }

  const token = generateResetToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const [, invite] = await prisma.$transaction([
    prisma.invite.updateMany({ where: { email, usedAt: null, revokedAt: null }, data: { revokedAt: now } }),
    prisma.invite.create({
      data: { email, role: body.role, tokenHash: hashResetToken(token), expiresAt, issuedById: actor.id },
      select: { id: true, email: true, role: true, expiresAt: true },
    }),
  ]);
  return NextResponse.json({ ...invite, path: `/sign-in?invite=${encodeURIComponent(token)}` }, { status: 201 });
}
