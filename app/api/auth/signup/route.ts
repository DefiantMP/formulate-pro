import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, passwordProblem } from '@/lib/auth';
import { generateRecoveryCode, normaliseRecoveryCode } from '@/lib/recoveryCode';
import { inviteProblem, normaliseInviteEmail, signupDecision } from '@/lib/invites';
import { hashResetToken } from '@/lib/passwordReset';

/**
 * Self-serve signup — a single-company internal tool, so no invite flow or
 * email verification.
 *
 * The requested role is IGNORED. Letting a signup pick its own role meant
 * anyone who could reach the app could mint a reviewer account and sign off
 * their own batches, which defeats the separation of duties the review step
 * exists to enforce. Instead: the very first account bootstraps as admin (so
 * a fresh deployment is usable at all), and every account after it is an
 * operator. Promoting someone is an admin action, not a self-service one.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const { name, email, password, inviteToken } = body;

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }
  if (typeof password !== 'string') {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }
  const pwProblem = passwordProblem(password);
  if (pwProblem) return NextResponse.json({ error: pwProblem }, { status: 400 });

  // Invite-only (lib/invites.ts): once an admin exists, a signup needs a
  // live invite for this exact email, and the invite decides the role. The
  // first account on an instance with no active admin needs none and becomes
  // admin — the bootstrap. Counting ACTIVE admins cannot be abused to reopen
  // it, because the last active admin can be neither demoted nor
  // deactivated (wouldRemoveLastAdmin in lib/auth.ts).
  const cleanEmail = normaliseInviteEmail(email);
  const activeAdmins = await prisma.user.count({ where: { role: 'admin', deletedAt: null } });
  const invite =
    typeof inviteToken === 'string' && inviteToken
      ? await prisma.invite.findUnique({ where: { tokenHash: hashResetToken(inviteToken) } })
      : null;
  const decision = signupDecision(
    activeAdmins,
    activeAdmins === 0
      ? null
      : typeof inviteToken === 'string' && inviteToken
        ? { problem: inviteProblem(invite, cleanEmail, new Date()), role: invite?.role ?? 'operator' }
        : null
  );
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 403 });

  const passwordHash = await hashPassword(password);
  // Every new account gets its recovery code at creation. It is in this
  // response and nowhere else — the sign-up screen shows it once.
  const recoveryCode = generateRecoveryCode();
  const recoveryCodeHash = await hashPassword(normaliseRecoveryCode(recoveryCode));
  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: name.trim(),
          email: cleanEmail,
          passwordHash,
          role: decision.role,
          recoveryCodeHash,
          recoveryCodeCreatedAt: new Date(),
        },
        select: { id: true, name: true, email: true, role: true },
      });
      // Claimed conditionally, inside the same transaction as the account:
      // two people racing the same link cannot both get an account, and a
      // failed account creation does not burn the invite.
      if (activeAdmins > 0 && invite) {
        const claimed = await tx.invite.updateMany({
          where: { id: invite.id, usedAt: null, revokedAt: null },
          data: { usedAt: new Date(), usedById: created.id },
        });
        if (claimed.count !== 1) throw new Error('invite-already-used');
      }
      return created;
    });
    return NextResponse.json({ ...user, recoveryCode }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === 'invite-already-used') {
      return NextResponse.json({ error: 'This invite has already been used.' }, { status: 403 });
    }
    // email is @unique — the realistic failure.
    return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 });
  }
}
