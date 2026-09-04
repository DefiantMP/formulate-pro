import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, passwordProblem } from '@/lib/auth';

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
  // Bootstrap: an empty instance needs one admin, or nobody could ever grant
  // the role. Counting deleted users too, so archiving the last admin cannot
  // reopen the bootstrap and hand the next signup admin rights.
  const isFirstAccount = (await prisma.user.count()) === 0;
  try {
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        role: isFirstAccount ? 'admin' : 'operator',
      },
      select: { id: true, name: true, email: true, role: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch {
    // email is @unique — the realistic failure.
    return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 });
  }
}
