import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { evaluateNumericResult } from '@/lib/lotSpecStatus';

/**
 * Log one test result against this lot and one criterion of its material's
 * spec.
 *
 * For a numeric_range criterion the verdict is COMPUTED here from
 * resultValue against the criterion's own min/max via evaluateNumericResult,
 * and any client-supplied passFail is ignored outright — the same "code
 * computes the verdict, the client doesn't assert it" split as
 * ScaleVerification's pass/fail (lib/scaleVerification.ts's computePassFail).
 * A client picks what was measured; it never gets to say whether that
 * measurement conforms.
 *
 * A qualitative criterion has nothing to compute against, so passFail is the
 * tester's own judgment and IS taken from the body — required, not defaulted,
 * so an omitted verdict can't quietly record as a pass.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { specCriterionId, resultValue, resultText, methodUsed, testedBy, testedAt, notes } = body;

  if (typeof specCriterionId !== 'string' || !specCriterionId.trim()) {
    return NextResponse.json({ error: 'specCriterionId is required' }, { status: 400 });
  }
  for (const [field, value] of [
    ['resultText', resultText],
    ['methodUsed', methodUsed],
    ['testedBy', testedBy],
    ['notes', notes],
  ] as const) {
    if (value !== null && value !== undefined && typeof value !== 'string') {
      return NextResponse.json({ error: `${field} must be a string or null` }, { status: 400 });
    }
  }

  const tested = testedAt === undefined ? new Date() : new Date(testedAt);
  if (Number.isNaN(tested.getTime())) {
    return NextResponse.json({ error: 'testedAt must be a valid date' }, { status: 400 });
  }

  const lot = await prisma.lot.findUnique({
    where: { id: params.id },
    include: { rawMaterial: { include: { spec: true } } },
  });
  if (!lot) {
    return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
  }

  const criterion = await prisma.specCriterion.findUnique({ where: { id: specCriterionId } });
  if (!criterion) {
    return NextResponse.json({ error: 'Spec criterion not found' }, { status: 404 });
  }
  // The criterion has to belong to THIS lot's material — otherwise a result
  // could be filed against another material's spec line, where it would then
  // be silently ignored by the rollup (which only reads this material's
  // criteria) and quietly never counted.
  if (!lot.rawMaterial.spec || criterion.componentSpecId !== lot.rawMaterial.spec.id) {
    return NextResponse.json(
      { error: "That criterion does not belong to this lot's raw material spec" },
      { status: 400 }
    );
  }
  if (criterion.retiredAt !== null) {
    return NextResponse.json(
      { error: 'That criterion has been retired from the spec and cannot take new results' },
      { status: 400 }
    );
  }

  let passFail: boolean;
  let storedValue: number | null = null;

  if (criterion.testType === 'numeric_range') {
    if (typeof resultValue !== 'number' || !Number.isFinite(resultValue)) {
      return NextResponse.json(
        { error: 'resultValue must be a number for a numeric_range criterion' },
        { status: 400 }
      );
    }
    const computed = evaluateNumericResult(criterion, resultValue);
    if (computed === null) {
      // Unreachable for a criterion written through the spec endpoint, which
      // rejects numeric criteria with no bounds — kept so a row created any
      // other way can't fall through to an unchecked verdict.
      return NextResponse.json(
        { error: 'That criterion has no minValue or maxValue to evaluate against' },
        { status: 400 }
      );
    }
    passFail = computed;
    storedValue = resultValue;
  } else {
    if (typeof body.passFail !== 'boolean') {
      return NextResponse.json(
        { error: 'passFail is required (boolean) for a qualitative criterion' },
        { status: 400 }
      );
    }
    passFail = body.passFail;
  }

  const test = await prisma.lotSpecTest.create({
    data: {
      lotId: lot.id,
      specCriterionId: criterion.id,
      resultValue: storedValue,
      resultText: resultText ?? null,
      passFail,
      methodUsed: methodUsed ?? null,
      testedBy: testedBy ?? null,
      testedAt: tested,
      notes: notes ?? null,
    },
    include: { specCriterion: { select: { id: true, parameterName: true, testType: true } } },
  });

  return NextResponse.json(test, { status: 201 });
}
