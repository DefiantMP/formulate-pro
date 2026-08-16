import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { LOT_SOURCE_TYPES, isLotSourceType } from '@/lib/rawMaterials';

/**
 * List/search received lots.
 * ?rawMaterialId= scopes to one material, ?sourceType= filters by origin,
 * ?q= substring-matches lot label, supplier, or material name.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const rawMaterialId = sp.get('rawMaterialId');
  const sourceType = sp.get('sourceType');
  const q = sp.get('q');

  if (sourceType && !isLotSourceType(sourceType)) {
    return NextResponse.json(
      { error: `sourceType must be one of ${LOT_SOURCE_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  const lots = await prisma.lot.findMany({
    where: {
      ...(rawMaterialId ? { rawMaterialId } : {}),
      ...(sourceType ? { sourceType } : {}),
      ...(q
        ? {
            OR: [
              { lotLabel: { contains: q } },
              { supplier: { contains: q } },
              { rawMaterial: { name: { contains: q } } },
            ],
          }
        : {}),
    },
    orderBy: { receivedDate: 'desc' },
    include: { rawMaterial: { select: { id: true, name: true, category: true } } },
  });

  // Deliberately no spec status on the list: computing it needs each lot's
  // full test history plus its material's criteria, which would be a large
  // per-row join on a page that's mostly used for finding a lot. Fetch the
  // individual lot for its status.
  return NextResponse.json(lots);
}

/** Receive a lot — the physical-arrival record. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const {
    rawMaterialId,
    lotLabel,
    receivedDate,
    quantityReceivedG,
    quantityRemainingG,
    sourceType,
    supplier,
    notes,
  } = body;

  if (typeof rawMaterialId !== 'string' || !rawMaterialId.trim()) {
    return NextResponse.json({ error: 'rawMaterialId is required' }, { status: 400 });
  }
  if (typeof lotLabel !== 'string' || !lotLabel.trim()) {
    return NextResponse.json({ error: 'lotLabel is required' }, { status: 400 });
  }
  if (typeof quantityReceivedG !== 'number' || !Number.isFinite(quantityReceivedG) || quantityReceivedG <= 0) {
    return NextResponse.json({ error: 'quantityReceivedG must be a positive number' }, { status: 400 });
  }
  if (
    quantityRemainingG !== undefined &&
    (typeof quantityRemainingG !== 'number' || !Number.isFinite(quantityRemainingG) || quantityRemainingG < 0)
  ) {
    return NextResponse.json({ error: 'quantityRemainingG must be a non-negative number' }, { status: 400 });
  }
  if (!isLotSourceType(sourceType)) {
    return NextResponse.json(
      { error: `sourceType must be one of ${LOT_SOURCE_TYPES.join(', ')}` },
      { status: 400 }
    );
  }
  if (supplier !== null && supplier !== undefined && typeof supplier !== 'string') {
    return NextResponse.json({ error: 'supplier must be a string or null' }, { status: 400 });
  }
  if (notes !== null && notes !== undefined && typeof notes !== 'string') {
    return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 });
  }

  const received = receivedDate === undefined ? new Date() : new Date(receivedDate);
  if (Number.isNaN(received.getTime())) {
    return NextResponse.json({ error: 'receivedDate must be a valid date' }, { status: 400 });
  }

  const material = await prisma.rawMaterial.findUnique({ where: { id: rawMaterialId } });
  if (!material) {
    return NextResponse.json({ error: 'Raw material not found' }, { status: 404 });
  }

  try {
    const lot = await prisma.lot.create({
      data: {
        rawMaterialId,
        lotLabel: lotLabel.trim(),
        receivedDate: received,
        quantityReceivedG,
        // A freshly received lot is full unless the caller says otherwise.
        quantityRemainingG: quantityRemainingG ?? quantityReceivedG,
        sourceType,
        supplier: supplier ?? null,
        notes: notes ?? null,
      },
      include: { rawMaterial: { select: { id: true, name: true, category: true } } },
    });
    return NextResponse.json(lot, { status: 201 });
  } catch {
    // @@unique([rawMaterialId, lotLabel]) — the realistic failure here is
    // receiving the same lot number for this material twice.
    return NextResponse.json(
      { error: 'That lot number already exists for this raw material' },
      { status: 409 }
    );
  }
}
