import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, passwordProblem } from '@/lib/auth';
import { normaliseEmail } from '@/lib/loginThrottle';
import { hashResetToken, resetTokenProblem } from '@/lib/passwordReset';

async function findToken(token: unknown) {
  if (typeof token !== 'string' || !token) return null;
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    include: { user: { select: { email: true, name: true, deletedAt: true } } },
  });
}

function stateOf(row: NonNullable<Awaited<ReturnType<typeof findToken>>>) {
  return { expiresAt: row.expiresAt, usedAt: row.usedAt, revokedAt: row.revokedAt, userDeleted: !!row.user.deletedAt };
}

/** Check a link before showing the form, so a dead link says so up front
 *  rather than after someone has typed a new password twice. */
export async function GET(request: NextRequest) {
  const row = await findToken(request.nextUrl.searchParams.get('token'));
  const problem = resetTokenProblem(row ? stateOf(row) : null, new Date());
  if (problem || !row) return NextResponse.json({ error: problem }, { status: 400 });
  return NextResponse.json({ email: row.user.email, name: row.user.name });
}

/**
 * Set a new password with a one-time link. In one transaction: the link is
 * claimed (conditionally, so two simultaneous submits cannot both succeed),
 * the password changes, every existing session for the account ends, other
 * outstanding links are revoked, and any sign-in lock is cleared.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const row = await findToken(body.token);
  const now = new Date();
  const problem = resetTokenProblem(row ? stateOf(row) : null, now);
  if (problem || !row) return NextResponse.json({ error: problem }, { status: 400 });

  if (typeof body.password !== 'string') {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }
  const pwProblem = passwordProblem(body.password);
  if (pwProblem) return NextResponse.json({ error: pwProblem }, { status: 400 });

  const passwordHash = await hashPassword(body.password);
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null, revokedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new Error('already-claimed');
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash, sessionsValidFrom: now } });
      await tx.passwordResetToken.updateMany({
        where: { userId: row.userId, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.loginThrottle.deleteMany({ where: { email: normaliseEmail(row.user.email) } });
    });
  } catch {
    return NextResponse.json({ error: 'This reset link has already been used. Ask an admin for a new one.' }, { status: 400 });
  }
  return NextResponse.json({ email: row.user.email });
}
