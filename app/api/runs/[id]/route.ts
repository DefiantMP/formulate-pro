import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Two independent partial-update use cases share this endpoint:
 *  - Lab COA results, entered later on the Run History page (actualMgPerTablet/
 *    actualTabletWeight/passFail/notes) — unchanged behavior, doesn't touch inputs/result.
 *  - Fresh Batch / Regrind autosave (label/mode/inputs/result/verificationAcknowledgment)
 *    upserting the same in-progress run as inputs change — see FormulateApp's autosave flow.
 * Only fields actually present in the body are written, so each caller's partial payload
 * leaves the other's fields untouched.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const {
    actualMgPerTablet,
    actualTabletWeight,
    passFail,
    notes,
    label,
    mode,
    inputs,
    result,
    verificationAcknowledgment,
  } = body;

  if (
    actualMgPerTablet !== null &&
    actualMgPerTablet !== undefined &&
    typeof actualMgPerTablet !== 'number'
  ) {
    return NextResponse.json({ error: 'actualMgPerTablet must be a number or null' }, { status: 400 });
  }
  if (
    actualTabletWeight !== null &&
    actualTabletWeight !== undefined &&
    typeof actualTabletWeight !== 'number'
  ) {
    return NextResponse.json({ error: 'actualTabletWeight must be a number or null' }, { status: 400 });
  }
  if (passFail !== null && passFail !== undefined && passFail !== 'pass' && passFail !== 'fail') {
    return NextResponse.json({ error: 'passFail must be "pass", "fail", or null' }, { status: 400 });
  }
  if (notes !== null && notes !== undefined && typeof notes !== 'string') {
    return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 });
  }
  if (label !== undefined && (typeof label !== 'string' || !label.trim())) {
    return NextResponse.json({ error: 'label must be a non-empty string' }, { status: 400 });
  }
  if (mode !== undefined && mode !== 'fresh' && mode !== 'regrind') {
    return NextResponse.json({ error: 'mode must be "fresh" or "regrind"' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if ('actualMgPerTablet' in body) data.actualMgPerTablet = actualMgPerTablet;
  if ('actualTabletWeight' in body) data.actualTabletWeight = actualTabletWeight;
  if ('passFail' in body) data.passFail = passFail;
  if ('notes' in body) data.notes = notes;
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
