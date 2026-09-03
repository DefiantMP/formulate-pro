import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, isUserRole, passwordProblem } from '@/lib/auth';

/** Self-serve signup — this is a single-company internal tool, so there is no
 *  invite flow or email verification. Flagged in the summary as something a
 *  multi-tenant deployment would have to replace. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const { name, email, password, role } = body;

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
  if (role !== undefined && !isUserRole(role)) {
    return NextResponse.json({ error: 'Unknown role' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        role: role ?? 'operator',
      },
      select: { id: true, name: true, email: true, role: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch {
    // email is @unique — the realistic failure.
    return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 });
  }
}
