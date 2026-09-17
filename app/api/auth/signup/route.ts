import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, passwordProblem } from '@/lib/auth';
import { generateRecoveryCode, normaliseRecoveryCode } from '@/lib/recoveryCode';

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
  const { name, email, password } = body;

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

  const passwordHash = await hashPassword(password);
  // Every new account gets its recovery code at creation. It is in this
  // response and nowhere else — the sign-up screen shows it once.
  const recoveryCode = generateRecoveryCode();
  const recoveryCodeHash = await hashPassword(normaliseRecoveryCode(recoveryCode));
  // Bootstrap: an instance with no active admin needs one, or nobody could
  // ever grant a role. This used to count every user including deactivated
  // ones, which left an instance whose accounts were all non-admins (or all
  // deactivated) permanently without an admin. Counting ACTIVE admins cannot
  // be abused to reopen the bootstrap, because the last active admin can be
  // neither demoted nor deactivated (wouldRemoveLastAdmin in lib/auth.ts).
  const isFirstAccount = (await prisma.user.count({ where: { role: 'admin', deletedAt: null } })) === 0;
  try {
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        role: isFirstAccount ? 'admin' : 'operator',
        recoveryCodeHash,
        recoveryCodeCreatedAt: new Date(),
      },
      select: { id: true, name: true, email: true, role: true },
    });
    return NextResponse.json({ ...user, recoveryCode }, { status: 201 });
  } catch {
    // email is @unique — the realistic failure.
    return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 });
  }
}
