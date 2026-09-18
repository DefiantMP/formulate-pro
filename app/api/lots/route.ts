import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { gmpActor } from '@/lib/session';
import { lotSpecStatus, lotSpecStatusInclude } from '@/lib/lotSpecStatus';
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
    // The list now carries a QC verdict. This used to be omitted, which made
    // the whole feature unusable at list level — a lot picker that cannot show
    // whether a lot passed is not a lot picker.
    //
    // Computed with ONE batched query using the same lotSpecStatusInclude and
    // the same rollup as GET /api/lots/[id], rather than a denormalized
    // cached column. A cached column would need invalidating on every spec
    // revision, every test, and every OOS approval, and any missed
    // invalidation shows up as a lot reporting the wrong QC verdict — the
    // exact failure this system exists to prevent. One join is cheaper than
    // that class of bug.
    include: {
      ...lotSpecStatusInclude,
      rawMaterial: {
        select: {
          id: true,
          name: true,
          category: true,
          spec: { select: { criteria: { where: { retiredAt: null } } } },
        },
      },
    },
  });

  return NextResponse.json(
    lots.map(({ specTests, ...lot }) => ({
      ...lot,
      // specTests are dropped from the payload: they are fetched only to
      // compute the verdict, and shipping every test of every lot to a
      // picker would dwarf the rest of the response.
      specStatus: lotSpecStatus({ rawMaterial: lot.rawMaterial, specTests }),
    }))
  );
}

/** Receive a lot — the physical-arrival record. */
export async function POST(request: NextRequest) {
  const who = await gmpActor('receive a lot');
  if (!who.ok) return NextResponse.json({ error: who.error }, { status: 401 });

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
        receivedById: who.user?.id ?? null,
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
