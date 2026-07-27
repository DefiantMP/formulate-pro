import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { SavedFormulationActive } from '@/lib/savedFormulations';

export async function GET() {
  const formulations = await prisma.savedFormulation.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(formulations);
}

function isValidActive(a: unknown): a is SavedFormulationActive {
  if (!a || typeof a !== 'object') return false;
  const active = a as Record<string, unknown>;
  return (
    typeof active.label === 'string' &&
    typeof active.targetMgPerTablet === 'number' &&
    typeof active.potencyPercent === 'number' &&
    typeof active.source === 'string'
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const {
    name,
    tabletWeightG,
    referenceBatchTablets,
    actives,
    fillerName,
    disintegrantName,
    disintegrantPercent,
    lubricantName,
    lubricantPercent,
    notes,
  } = body;

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (typeof tabletWeightG !== 'number' || tabletWeightG <= 0) {
    return NextResponse.json({ error: 'tabletWeightG must be a positive number' }, { status: 400 });
  }
  if (typeof referenceBatchTablets !== 'number' || referenceBatchTablets <= 0) {
    return NextResponse.json({ error: 'referenceBatchTablets must be a positive number' }, { status: 400 });
  }
  if (!Array.isArray(actives) || actives.length === 0 || !actives.every(isValidActive)) {
    return NextResponse.json(
      { error: 'At least one valid active ingredient (label, targetMgPerTablet, potencyPercent, source) is required' },
      { status: 400 }
    );
  }
  if (typeof fillerName !== 'string' || !fillerName.trim()) {
    return NextResponse.json({ error: 'fillerName is required' }, { status: 400 });
  }

  const formulation = await prisma.savedFormulation.create({
    data: {
      name: name.trim(),
      tabletWeightG,
      referenceBatchTablets,
      actives: actives as unknown as Prisma.InputJsonValue,
      fillerName: fillerName.trim(),
      disintegrantName: typeof disintegrantName === 'string' && disintegrantName.trim() ? disintegrantName.trim() : null,
      disintegrantPercent: typeof disintegrantPercent === 'number' ? disintegrantPercent : null,
      lubricantName: typeof lubricantName === 'string' && lubricantName.trim() ? lubricantName.trim() : null,
      lubricantPercent: typeof lubricantPercent === 'number' ? lubricantPercent : null,
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    },
  });

  return NextResponse.json(formulation, { status: 201 });
}
