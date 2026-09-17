import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { runChatTurn } from '@/lib/chat';
import { buildExcipientRationaleSystemPrompt, parseExcipientRationaleReply } from '@/lib/excipientRationale';

/**
 * Unrecognised-excipient tier of the blend rationale panel (the known-table
 * tier in lib/knownExcipients.ts needs no API call). Thin route handler:
 * prompt and parsing live in lib/excipientRationale.ts, the round trip
 * reuses lib/chat.ts's runChatTurn — same shape as /api/active-suggestions.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  const percentOfBlend = typeof body?.percentOfBlend === 'number' ? body.percentOfBlend : null;

  const client = new Anthropic({ apiKey });
  const outcome = await runChatTurn(
    {
      systemPrompt: buildExcipientRationaleSystemPrompt(),
      history: [],
      userMessage:
        `Excipient: ${name}` +
        (percentOfBlend !== null ? `\nUsed at ${percentOfBlend}% of the blend in this formulation.` : ''),
    },
    (params) => client.messages.create(params)
  );

  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });

  const rationale = parseExcipientRationaleReply(name, outcome.reply);
  if (!rationale) {
    return NextResponse.json({ error: 'Could not parse an explanation from the model response' }, { status: 502 });
  }
  return NextResponse.json(rationale);
}
