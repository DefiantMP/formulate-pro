import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { generateResetToken, hashResetToken, RESET_TOKEN_TTL_MS } from '@/lib/passwordReset';

/**
 * Issue a one-time password reset link for an account. Admin only — there is
 * no email in this app, so the admin hands the link over in person.
 *
 * The raw token is in this response and nowhere else; only its hash is
 * stored. Issuing a new link revokes any older unused one for the same user.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can issue reset links.' }, { status: 403 });
  }

  const target = await prisma.user.findFirst({ where: { id: params.id, deletedAt: null } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const token = generateResetToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS);
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: target.id, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.passwordResetToken.create({
      data: { userId: target.id, issuedById: actor.id, tokenHash: hashResetToken(token), expiresAt },
    }),
  ]);

  return NextResponse.json(
    { path: `/reset-password?token=${encodeURIComponent(token)}`, expiresAt: expiresAt.toISOString(), email: target.email },
    { status: 201 }
  );
}
