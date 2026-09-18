import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { approvedRunEditError, isReviewStatus, reviewSubmissionError, selfReviewError } from '@/lib/gmp';
import { getGmpSettings } from '@/lib/gmpSettings';
import { getCurrentUser } from '@/lib/session';
import { canReview } from '@/lib/auth';
import { syncFormulationFromRun } from '@/lib/runFormulationSync';

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
    product,
    reviewStatus,
    reviewNotes,
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
  // Nullable on purpose: this is also how an existing run gets tagged after
  // the fact, and how a mistagged one is cleared.
  if (product !== null && product !== undefined && typeof product !== 'string') {
    return NextResponse.json({ error: 'product must be a string or null' }, { status: 400 });
  }

  // An approved batch's numbers are frozen (lib/gmp.ts approvedRunEditError).
  // Checked against the stored status, and skipped when this same request is
  // reopening it — a reviewer setting it back to pending is how a correction
  // starts.
  const existing = await prisma.run.findUnique({
    where: { id: params.id },
    select: { reviewStatus: true, createdById: true },
  });
  if (!existing) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  const reopening = reviewStatus !== undefined && reviewStatus !== 'approved';
  if (!reopening) {
    const frozen = approvedRunEditError(
      existing.reviewStatus,
      ['inputs', 'result', 'mode'].filter((k) => k in body)
    );
    if (frozen) return NextResponse.json({ error: frozen }, { status: 409 });
  }

  // QC review sign-off. Validated even with GMP mode off: if a reviewer is
  // recording a decision at all, an unexplained rejection is not a record —
  // the mode governs whether review is REQUIRED, not whether a submitted one
  // may be incoherent.
  let reviewer: { id: string; name: string; role: string } | null = null;
  if (reviewStatus !== undefined) {
    if (!isReviewStatus(reviewStatus)) {
      return NextResponse.json(
        { error: "reviewStatus must be 'pending', 'approved' or 'rejected'" },
        { status: 400 }
      );
    }
    reviewer = await getCurrentUser();
    const gmp = await getGmpSettings();
    if (gmp.enabled) {
      if (!reviewer) {
        return NextResponse.json(
          { error: 'GMP mode: sign in to review a batch — the sign-off is recorded against your account.' },
          { status: 401 }
        );
      }
      // An operator running batches should not also be signing them off; that
      // separation is the reason the review step exists.
      if (!canReview(reviewer.role)) {
        return NextResponse.json(
          { error: 'GMP mode: your account does not have the reviewer role.' },
          { status: 403 }
        );
      }
    }
    const selfReview = selfReviewError(gmp, reviewer?.id ?? null, existing.createdById);
    if (selfReview) return NextResponse.json({ error: selfReview }, { status: 403 });
    const problem = reviewSubmissionError(reviewStatus, reviewer?.name ?? 'unauthenticated', reviewNotes);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (reviewStatus !== undefined) {
    data.reviewStatus = reviewStatus;
    data.reviewerId = reviewer?.id ?? null;
    data.reviewNotes = typeof reviewNotes === 'string' && reviewNotes.trim() ? reviewNotes.trim() : null;
    data.reviewedAt = new Date();
  }
  if ('product' in body) {
    data.product = typeof product === 'string' && product.trim() ? product.trim() : null;
  }
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

    // Auto-promotion side effect, only for an autosave-shaped PATCH (one
    // that actually carries composition data) — never for a COA-only PATCH,
    // which has neither inputs nor result. Best-effort, same as the create
    // path in POST /api/runs — never let a promotion failure fail the run
    // update itself.
    if (inputs !== undefined && result !== undefined) {
      try {
        await syncFormulationFromRun(run);
      } catch (err) {
        console.error('[run-formulation-sync] failed to sync formulation for run', run.id, err);
      }
    }

    return NextResponse.json(run);
  } catch {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
}

/**
 * Soft delete — sets deletedAt rather than removing the row. A hard delete
 * risks a FK constraint failure (or, if that constraint were ever relaxed,
 * silently orphaning) any ScaleVerification or RunLotUsage row that
 * references this run. Idempotent: archiving an already-archived run just
 * re-stamps deletedAt, no error.
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.run.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
}
