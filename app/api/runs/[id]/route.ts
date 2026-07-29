import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Fresh Batch / Regrind autosave: upserts the same in-progress run as inputs
 * change (label/mode/inputs/result/verificationAcknowledgment) — see
 * FormulateApp's autosave flow. Only fields actually present in the body are
 * written.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { label, mode, inputs, result, verificationAcknowledgment } = body;

  if (label !== undefined && (typeof label !== 'string' || !label.trim())) {
    return NextResponse.json({ error: 'label must be a non-empty string' }, { status: 400 });
  }
  if (mode !== undefined && mode !== 'fresh' && mode !== 'regrind') {
    return NextResponse.json({ error: 'mode must be "fresh" or "regrind"' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (label !== undefined) data.label = label.trim();
  if (mode !== undefined) data.mode = mode;
  if (inputs !== undefined) data.inputs = inputs;
  if (result !== undefined) data.result = result;
  if ('verificationAcknowledgment' in body) data.verificationAcknowledgment = verificationAcknowledgment ?? null;

  try {
    const run = await prisma.run.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(run);
  } catch {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
}
