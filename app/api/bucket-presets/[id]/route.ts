import { NextResponse } from 'next/server';
import { deleteBucketPreset } from '@/lib/bucketPresets';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await deleteBucketPreset(params.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
  }
}
