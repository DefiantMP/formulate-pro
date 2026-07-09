import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateDefaultFormulation } from '@/lib/formulations';

export async function GET() {
  const runs = await prisma.run.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json(runs);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { label, mode, inputs, result } = body ?? {};

  if (typeof label !== 'string' || !label.trim()) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 });
  }
  if (mode !== 'fresh' && mode !== 'regrind') {
    return NextResponse.json({ error: 'mode must be "fresh" or "regrind"' }, { status: 400 });
  }
  if (!inputs || !result) {
    return NextResponse.json({ error: 'inputs and result are required' }, { status: 400 });
  }

  const formulation = await getOrCreateDefaultFormulation();

  const run = await prisma.run.create({
    data: {
      label: label.trim(),
      mode,
      formulationId: formulation.id,
      inputs,
      result,
    },
  });

  return NextResponse.json(run, { status: 201 });
}
