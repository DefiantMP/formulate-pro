import { NextResponse } from 'next/server';
import { deleteRegrindLotPreset } from '@/lib/regrindPresets';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await deleteRegrindLotPreset(params.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
  }
}
