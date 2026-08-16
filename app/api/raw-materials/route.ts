import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { RAW_MATERIAL_CATEGORIES, isRawMaterialCategory } from '@/lib/rawMaterials';

/** ?category= filters by category; ?q= substring-matches the name. */
export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get('category');
  const q = request.nextUrl.searchParams.get('q');

  if (category && !isRawMaterialCategory(category)) {
    return NextResponse.json(
      { error: `category must be one of ${RAW_MATERIAL_CATEGORIES.join(', ')}` },
      { status: 400 }
    );
  }

  const materials = await prisma.rawMaterial.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(q ? { name: { contains: q } } : {}),
    },
    orderBy: { name: 'asc' },
    include: {
      spec: { select: { id: true, name: true } },
      _count: { select: { lots: true } },
    },
  });
  return NextResponse.json(materials);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { name, category } = body;

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!isRawMaterialCategory(category)) {
    return NextResponse.json(
      { error: `category must be one of ${RAW_MATERIAL_CATEGORIES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const material = await prisma.rawMaterial.create({
      data: { name: name.trim(), category },
    });
    return NextResponse.json(material, { status: 201 });
  } catch {
    // name is @unique — the only realistic failure here.
    return NextResponse.json({ error: 'A raw material with that name already exists' }, { status: 409 });
  }
}
