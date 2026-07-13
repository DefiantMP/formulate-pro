import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { runVerification, type VerifyRequestBody } from '@/lib/aiVerification';

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server' }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as VerifyRequestBody | null;
  if (!body || !body.mode || !body.inputs || !body.result) {
    return NextResponse.json({ error: 'mode, inputs, and result are required' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const outcome = await runVerification(body, (params) => client.messages.create(params));

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  return NextResponse.json(outcome.result);
}
