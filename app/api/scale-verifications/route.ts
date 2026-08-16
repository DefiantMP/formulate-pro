import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';
import { currentOrganizationId } from '@/lib/organization';
import { computePassFail, runScaleReading, DEFAULT_TOLERANCE_PERCENT } from '@/lib/scaleVerification';
import { findRunIngredientWeight } from '@/lib/runIngredientBreakdown';

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status');
  const verifications = await prisma.scaleVerification.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    include: { run: { select: { label: true } } },
  });
  return NextResponse.json(verifications);
}

const DATA_URL_PATTERN = /^data:([a-zA-Z0-9/.+-]+);base64,(.+)$/;

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { runId, ingredientLabel, photoDataUrl } = body;

  if (typeof runId !== 'string' || !runId.trim()) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 });
  }
  if (typeof ingredientLabel !== 'string' || !ingredientLabel.trim()) {
    return NextResponse.json({ error: 'ingredientLabel is required' }, { status: 400 });
  }
  if (typeof photoDataUrl !== 'string') {
    return NextResponse.json({ error: 'photoDataUrl is required' }, { status: 400 });
  }
  const match = DATA_URL_PATTERN.exec(photoDataUrl);
  if (!match) {
    return NextResponse.json({ error: 'photoDataUrl must be a base64 data: URL' }, { status: 400 });
  }
  const [, mediaType, imageBase64] = match;

  // Expected weight is never operator-entered — it's re-derived here from
  // the run's own already-computed result, the same way the troubleshooting
  // chat route reloads a formulation server-side rather than trusting
  // client-supplied context. A client can only pick which run/ingredient to
  // verify against, never what the "correct" answer should be.
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  const expectedWeightG = findRunIngredientWeight(run, ingredientLabel);
  if (expectedWeightG === null) {
    return NextResponse.json(
      { error: `"${ingredientLabel}" is not an ingredient in this run's breakdown` },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });
  const outcome = await runScaleReading({ imageBase64, mediaType }, (params) => client.messages.create(params));
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  const toleranceType = 'percent' as const;
  const toleranceValue = DEFAULT_TOLERANCE_PERCENT;
  const passFail = computePassFail(expectedWeightG, toleranceType, toleranceValue, outcome.result.weightGrams);

  const verification = await prisma.scaleVerification.create({
    data: {
      organizationId: currentOrganizationId(),
      runId: run.id,
      ingredientLabel,
      expectedWeightG,
      toleranceType,
      toleranceValue,
      aiReadingWeightG: outcome.result.weightGrams,
      operatorReadingWeightG: outcome.result.weightGrams,
      passFail,
      confident: outcome.result.confident,
      modelNotes: outcome.result.reasoning,
      photoDataUrl,
      status: 'pending',
    },
    include: { run: { select: { label: true } } },
  });

  return NextResponse.json(verification, { status: 201 });
}
