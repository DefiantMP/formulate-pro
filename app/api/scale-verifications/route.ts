import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';
import { currentOrganizationId } from '@/lib/organization';
import { computePassFail, runScaleReading, type ToleranceType } from '@/lib/scaleVerification';

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status');
  const verifications = await prisma.scaleVerification.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
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
  const { ingredientLabel, expectedWeightG, toleranceType, toleranceValue, photoDataUrl } = body;

  if (typeof ingredientLabel !== 'string' || !ingredientLabel.trim()) {
    return NextResponse.json({ error: 'ingredientLabel is required' }, { status: 400 });
  }
  if (typeof expectedWeightG !== 'number' || expectedWeightG <= 0) {
    return NextResponse.json({ error: 'expectedWeightG must be a positive number' }, { status: 400 });
  }
  if (toleranceType !== 'absolute' && toleranceType !== 'percent') {
    return NextResponse.json({ error: 'toleranceType must be "absolute" or "percent"' }, { status: 400 });
  }
  if (typeof toleranceValue !== 'number' || toleranceValue < 0) {
    return NextResponse.json({ error: 'toleranceValue must be a non-negative number' }, { status: 400 });
  }
  if (typeof photoDataUrl !== 'string') {
    return NextResponse.json({ error: 'photoDataUrl is required' }, { status: 400 });
  }
  const match = DATA_URL_PATTERN.exec(photoDataUrl);
  if (!match) {
    return NextResponse.json({ error: 'photoDataUrl must be a base64 data: URL' }, { status: 400 });
  }
  const [, mediaType, imageBase64] = match;

  const client = new Anthropic({ apiKey });
  const outcome = await runScaleReading({ imageBase64, mediaType }, (params) => client.messages.create(params));
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  const passFail = computePassFail(
    expectedWeightG,
    toleranceType as ToleranceType,
    toleranceValue,
    outcome.result.weightGrams
  );

  const verification = await prisma.scaleVerification.create({
    data: {
      organizationId: currentOrganizationId(),
      ingredientLabel: ingredientLabel.trim(),
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
  });

  return NextResponse.json(verification, { status: 201 });
}
