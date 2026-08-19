import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateDefaultFormulation } from '@/lib/formulations';
import { syncFormulationFromRun } from '@/lib/runFormulationSync';

/** ?product= scopes to one product's run history, for prior-run suggestions. */
export async function GET(request: NextRequest) {
  const product = request.nextUrl.searchParams.get('product');
  const runs = await prisma.run.findMany({
    where: product ? { product } : {},
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json(runs);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { label, product, mode, inputs, result, verificationAcknowledgment } = body ?? {};

  if (typeof label !== 'string' || !label.trim()) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 });
  }
  if (mode !== 'fresh' && mode !== 'regrind') {
    return NextResponse.json({ error: 'mode must be "fresh" or "regrind"' }, { status: 400 });
  }
  if (product !== null && product !== undefined && typeof product !== 'string') {
    return NextResponse.json({ error: 'product must be a string or null' }, { status: 400 });
  }
  if (!inputs || !result) {
    return NextResponse.json({ error: 'inputs and result are required' }, { status: 400 });
  }

  const formulation = await getOrCreateDefaultFormulation();

  const run = await prisma.run.create({
    data: {
      label: label.trim(),
      // Optional: a run with no product simply gets no prior-run suggestions.
      product: typeof product === 'string' && product.trim() ? product.trim() : null,
      mode,
      formulationId: formulation.id,
      inputs,
      result,
      verificationAcknowledgment: verificationAcknowledgment ?? undefined,
    },
  });

  // Auto-promotion side effect: mirror this run into the Formulations
  // library so it has something to Iterate from without a manual save.
  // Best-effort — never let a promotion failure fail the run save itself.
  try {
    await syncFormulationFromRun(run);
  } catch (err) {
    console.error('[run-formulation-sync] failed to sync formulation for run', run.id, err);
  }

  return NextResponse.json(run, { status: 201 });
}
