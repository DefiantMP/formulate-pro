import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { effectiveLineageId, SAVED_FORMULATION_STATUSES, type SavedFormulationActive } from '@/lib/savedFormulations';

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
    parentId,
    status,
    outcomeNotes,
    equipmentNotes,
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
  if (status !== undefined && (typeof status !== 'string' || !SAVED_FORMULATION_STATUSES.includes(status as never))) {
    return NextResponse.json(
      { error: `status must be one of ${SAVED_FORMULATION_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  // Iterating from an existing formulation: inherit its lineage and bump the
  // version number. The prior version's own row is never modified — this is
  // always a fresh create, matching the builder's existing create-only
  // semantics (no update/edit endpoint exists or is needed).
  let lineageId: string | null = null;
  let version = 1;
  if (parentId !== undefined) {
    if (typeof parentId !== 'string' || !parentId.trim()) {
      return NextResponse.json({ error: 'parentId must be a non-empty string when provided' }, { status: 400 });
    }
    const parent = await prisma.savedFormulation.findUnique({ where: { id: parentId } });
    if (!parent) {
      return NextResponse.json({ error: 'parentId does not reference an existing formulation' }, { status: 400 });
    }
    lineageId = effectiveLineageId(parent);
    version = parent.version + 1;
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
      lineageId,
      version,
      parentId: typeof parentId === 'string' ? parentId : null,
      status: typeof status === 'string' ? status : 'untested',
      outcomeNotes: typeof outcomeNotes === 'string' && outcomeNotes.trim() ? outcomeNotes.trim() : null,
      equipmentNotes: typeof equipmentNotes === 'string' && equipmentNotes.trim() ? equipmentNotes.trim() : null,
    },
  });

  return NextResponse.json(formulation, { status: 201 });
}
