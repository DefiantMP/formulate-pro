import { NextRequest, NextResponse } from 'next/server';
import { listRegrindLotPresets, createRegrindLotPreset } from '@/lib/regrindPresets';
import type { PotencyInput } from '@/lib/calc-engine/types';

export async function GET() {
  const presets = await listRegrindLotPresets();
  return NextResponse.json(presets);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { name, potency, disintegrantPercent, lubricantPercent } = body ?? {};

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!potency || (potency as PotencyInput).method == null) {
    return NextResponse.json({ error: 'potency is required' }, { status: 400 });
  }

  try {
    const preset = await createRegrindLotPreset({
      name: name.trim(),
      potency: potency as PotencyInput,
      disintegrantPercent: typeof disintegrantPercent === 'number' ? disintegrantPercent : null,
      lubricantPercent: typeof lubricantPercent === 'number' ? lubricantPercent : null,
    });
    return NextResponse.json(preset, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'A preset with that name already exists' }, { status: 409 });
  }
}
