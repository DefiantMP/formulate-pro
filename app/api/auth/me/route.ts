import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });
  // Whether a recovery code exists (never the code) — Settings nags accounts
  // made before codes existed until they create one.
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { recoveryCodeCreatedAt: true } });
  return NextResponse.json({ user: { ...user, recoveryCodeCreatedAt: row?.recoveryCodeCreatedAt ?? null } });
}
