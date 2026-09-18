import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { computePassFail, type ToleranceType } from '@/lib/scaleVerification';
import { prisma as db } from '@/lib/db';
import { verifyOrDummy } from '@/lib/auth';
import { lockedMessage, lockMinutesRemaining, normaliseEmail, stateAfterFailure } from '@/lib/loginThrottle';
import { weighVerificationError } from '@/lib/gmp';
import { getGmpSettings } from '@/lib/gmpSettings';

/**
 * Two supported updates:
 * - { operatorReadingWeightG: number } — an operator correcting the AI's
 *   reading before manager review. aiReadingWeightG is left untouched;
 *   passFail is recomputed against the new operatorReadingWeightG. Blocked
 *   once approved, since the photo is gone by then and there's nothing left
 *   to re-check the correction against.
 * - { status: 'approved' } — deletes the stored photo (photoDataUrl -> null)
 *   but keeps every other field — readings, pass/fail, timestamps —
 *   permanently, per Phase 1's "discard the photo once approved" rule.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const existing = await prisma.scaleVerification.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: 'Verification not found' }, { status: 404 });
  }

  // Second-person verification by STEP-UP AUTH: the verifier supplies their
  // own credentials on this action rather than the weigher logging out and the
  // verifier logging in. On a shared floor terminal mid-batch a full session
  // swap is impractical and would get worked around; this still proves a
  // second account, because the password is checked server-side and the
  // resulting id must differ from the weigher's.
  if (body.verifierEmail !== undefined || body.verifierPassword !== undefined) {
    const { verifierEmail, verifierPassword } = body;
    if (typeof verifierEmail !== 'string' || typeof verifierPassword !== 'string') {
      return NextResponse.json({ error: 'Verifier email and password are required' }, { status: 400 });
    }
    // Same protections as sign-in: this is a password check, so it shares
    // the per-email throttle (the audit guessed a verifier's password six
    // times with no lock) and runs bcrypt even for an unknown email.
    const key = normaliseEmail(verifierEmail);
    const now = new Date();
    const throttle = await db.loginThrottle.findUnique({ where: { email: key } });
    const lockedFor = lockMinutesRemaining(throttle, now);
    if (lockedFor > 0) return NextResponse.json({ error: lockedMessage(lockedFor) }, { status: 429 });
    const verifier = await db.user.findFirst({ where: { email: key, deletedAt: null } });
    const ok = await verifyOrDummy(verifierPassword, verifier?.passwordHash);
    if (!verifier || !ok) {
      const next = stateAfterFailure(throttle, now);
      await db.loginThrottle.upsert({ where: { email: key }, create: { email: key, ...next }, update: next });
      const nowLocked = lockMinutesRemaining(next, now);
      if (nowLocked > 0) return NextResponse.json({ error: lockedMessage(nowLocked) }, { status: 429 });
      return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 });
    }
    if (throttle) await db.loginThrottle.deleteMany({ where: { email: key } });

    const gmp = await getGmpSettings();
    const problem = weighVerificationError(
      { weighedById: existing.weighedById, verifiedById: verifier.id },
      gmp
    );
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    // Enforced regardless of the mode: a verification that records the same
    // account for both halves is not a two-person check under any setting,
    // and storing one would misrepresent the record.
    if (existing.weighedById && existing.weighedById === verifier.id) {
      return NextResponse.json(
        { error: 'The verifier must be a different account from the weigher.' },
        { status: 400 }
      );
    }

    const verified = await prisma.scaleVerification.update({
      where: { id: params.id },
      data: { verifiedById: verifier.id, verifiedAt: new Date() },
      include: { run: { select: { label: true } } },
    });
    return NextResponse.json(verified);
  }

  if (typeof body.operatorReadingWeightG === 'number') {
    if (existing.status === 'approved') {
      return NextResponse.json({ error: 'Cannot edit an already-approved verification' }, { status: 400 });
    }
    const passFail = computePassFail(
      existing.expectedWeightG,
      existing.toleranceType as ToleranceType,
      existing.toleranceValue,
      body.operatorReadingWeightG
    );
    const updated = await prisma.scaleVerification.update({
      where: { id: params.id },
      data: { operatorReadingWeightG: body.operatorReadingWeightG, passFail },
      include: { run: { select: { label: true } } },
    });
    return NextResponse.json(updated);
  }

  if (body.status === 'approved') {
    if (existing.status === 'approved') {
      return NextResponse.json({ error: 'Verification is already approved' }, { status: 400 });
    }
    const updated = await prisma.scaleVerification.update({
      where: { id: params.id },
      data: { status: 'approved', approvedAt: new Date(), photoDataUrl: null },
      include: { run: { select: { label: true } } },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: 'Unsupported update' }, { status: 400 });
}
