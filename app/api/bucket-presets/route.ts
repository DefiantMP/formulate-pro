import { NextRequest, NextResponse } from 'next/server';
import { listBucketPresets, createBucketPreset } from '@/lib/bucketPresets';

export async function GET() {
  const presets = await listBucketPresets();
  return NextResponse.json(presets);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { name, tareWeightG } = body ?? {};

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (typeof tareWeightG !== 'number' || !Number.isFinite(tareWeightG) || tareWeightG <= 0) {
    return NextResponse.json({ error: 'tareWeightG must be greater than 0' }, { status: 400 });
  }

  try {
    const preset = await createBucketPreset({ name: name.trim(), tareWeightG });
    return NextResponse.json(preset, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'A bucket with that name already exists' }, { status: 409 });
  }
}
