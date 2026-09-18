import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateDefaultFormulation } from '@/lib/formulations';
import { syncFormulationFromRun } from '@/lib/runFormulationSync';
import { parseLotUsages, validateLotUsages, type LotForUsage } from '@/lib/runLotUsage';
import { getGmpSettings } from '@/lib/gmpSettings';
import { lotSpecStatus, lotSpecStatusInclude } from '@/lib/lotSpecStatus';
import { getCurrentUser } from '@/lib/session';

/** ?product= scopes to one product's run history, for prior-run suggestions. */
export async function GET(request: NextRequest) {
  const product = request.nextUrl.searchParams.get('product');
  const runs = await prisma.run.findMany({
    include: {
      reviewer: { select: { name: true } },
      createdBy: { select: { name: true } },
      deviations: { select: { id: true, disposition: true } },
    },
    // deletedAt: null excludes archived runs by default — see DELETE
    // /api/runs/[id]. No way to include them from this endpoint; they're
    // still reachable directly (e.g. a PATCH by id still works) but never
    // listed.
    where: { deletedAt: null, ...(product ? { product } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json(runs);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { label, product, mode, inputs, result, verificationAcknowledgment, lotUsages } = body ?? {};

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

  // Who saved the batch. With GMP mode on it must be someone: an unattributed
  // batch record cannot be checked for self-review, and "who made this" is
  // the first question an auditor asks. Off, a signed-out save is allowed
  // and simply records nobody.
  const creator = await getCurrentUser();
  if (!creator && (await getGmpSettings()).enabled) {
    return NextResponse.json(
      { error: 'GMP mode: sign in to save a batch — it is recorded against your account.' },
      { status: 401 }
    );
  }

  // Which tracked lots this batch consumed. Optional — a run that does not
  // draw on received inventory simply has none.
  const parsedUsages = parseLotUsages(lotUsages);
  if (!parsedUsages.ok) {
    return NextResponse.json({ error: parsedUsages.error }, { status: 400 });
  }

  let usageWarnings: string[] = [];
  if (parsedUsages.value.length > 0) {
    const settings = await getGmpSettings();
    const lots = await prisma.lot.findMany({
      where: { id: { in: parsedUsages.value.map((u) => u.lotId) } },
      include: lotSpecStatusInclude,
    });
    const forUsage: LotForUsage[] = lots.map((l) => ({
      id: l.id,
      lotLabel: l.lotLabel,
      quantityRemainingG: l.quantityRemainingG,
      specStatus: lotSpecStatus(l),
      rawMaterial: { name: l.rawMaterial.name, spec: l.rawMaterial.spec },
    }));
    const { errors, warnings } = validateLotUsages(parsedUsages.value, forUsage, settings);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' '), errors }, { status: 400 });
    }
    usageWarnings = warnings;
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
      createdById: creator?.id ?? null,
    },
  });

  // Usage rows and the stock draw-down happen together: a consumed lot whose
  // remaining quantity was not reduced would overstate inventory, and a
  // draw-down with no usage row would be unattributable. One transaction so
  // neither can happen alone.
  //
  // NOTE: there is still no lot PATCH, so a draw-down recorded here cannot be
  // corrected afterwards — see CLAUDE.md's Open Flags.
  if (parsedUsages.value.length > 0) {
    await prisma.$transaction(
      parsedUsages.value.flatMap((u) => [
        prisma.runLotUsage.create({
          data: { runId: run.id, lotId: u.lotId, amountUsedG: u.amountUsedG, roleInRun: u.roleInRun },
        }),
        prisma.lot.update({
          where: { id: u.lotId },
          data: { quantityRemainingG: { decrement: u.amountUsedG } },
        }),
      ])
    );
  }

  // Auto-promotion side effect: mirror this run into the Formulations
  // library so it has something to Iterate from without a manual save.
  // Best-effort — never let a promotion failure fail the run save itself.
  try {
    await syncFormulationFromRun(run);
  } catch (err) {
    console.error('[run-formulation-sync] failed to sync formulation for run', run.id, err);
  }

  return NextResponse.json({ ...run, usageWarnings }, { status: 201 });
}
