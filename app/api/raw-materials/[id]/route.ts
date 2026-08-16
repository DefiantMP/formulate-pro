import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { RAW_MATERIAL_CATEGORIES, isRawMaterialCategory } from '@/lib/rawMaterials';

/**
 * The material plus its ComponentSpec and that spec's criteria.
 *
 * Retired criteria are returned too, in a separate `retiredCriteria` array
 * rather than mixed into `spec.criteria` — they're excluded from status and
 * from new tests, but a QA reviewer still needs to see that a parameter used
 * to be on the spec when reading a lot's older results. Anything driving
 * status or a test form must read `spec.criteria`.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const material = await prisma.rawMaterial.findUnique({
    where: { id: params.id },
    include: {
      spec: {
        include: {
          criteria: { where: { retiredAt: null }, orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });
  if (!material) {
    return NextResponse.json({ error: 'Raw material not found' }, { status: 404 });
  }

  const retiredCriteria = material.spec
    ? await prisma.specCriterion.findMany({
        where: { componentSpecId: material.spec.id, retiredAt: { not: null } },
        orderBy: { retiredAt: 'desc' },
      })
    : [];

  return NextResponse.json({ ...material, retiredCriteria });
}

/** Rename or recategorize a material. Its spec is edited separately, via
 *  PUT /api/raw-materials/[id]/spec. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { name, category } = body;

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
  }
  if (category !== undefined && !isRawMaterialCategory(category)) {
    return NextResponse.json(
      { error: `category must be one of ${RAW_MATERIAL_CATEGORIES.join(', ')}` },
      { status: 400 }
    );
  }

  // Same partial-update shape as PATCH /api/runs/[id]: only fields actually
  // present in the body are written.
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name.trim();
  if (category !== undefined) data.category = category;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Unsupported update' }, { status: 400 });
  }

  const existing = await prisma.rawMaterial.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: 'Raw material not found' }, { status: 404 });
  }

  try {
    const material = await prisma.rawMaterial.update({ where: { id: params.id }, data });
    return NextResponse.json(material);
  } catch {
    return NextResponse.json({ error: 'A raw material with that name already exists' }, { status: 409 });
  }
}
