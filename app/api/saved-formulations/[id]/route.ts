import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const formulation = await prisma.savedFormulation.findUnique({ where: { id: params.id } });
  if (!formulation) {
    return NextResponse.json({ error: 'Formulation not found' }, { status: 404 });
  }
  return NextResponse.json(formulation);
}
