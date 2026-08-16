import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { runChatTurn } from '@/lib/chat';
import { buildActiveSuggestionSystemPrompt, parseActiveSuggestionReply } from '@/lib/activeSuggestion';

/**
 * Unrecognized/proprietary-active tier of the Guided wizard's smart
 * suggestions (see lib/knownActives.ts for the known-table tier, which needs
 * no API call). Thin route handler — prompt construction and reply parsing
 * live in lib/activeSuggestion.ts, and the actual Anthropic round trip
 * reuses lib/chat.ts's runChatTurn, the same single-turn text-generation
 * helper the troubleshooting chat uses. Not tool-use/verification-gated:
 * this returns an advisory starting point, not a computed value.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const activeLabel = typeof body?.activeLabel === 'string' ? body.activeLabel.trim() : '';
  if (!activeLabel) {
    return NextResponse.json({ error: 'activeLabel is required' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const outcome = await runChatTurn(
    {
      systemPrompt: buildActiveSuggestionSystemPrompt(),
      history: [],
      userMessage: `Active ingredient: ${activeLabel}`,
    },
    (params) => client.messages.create(params)
  );

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  const suggestion = parseActiveSuggestionReply(activeLabel, outcome.reply);
  if (!suggestion) {
    return NextResponse.json({ error: 'Could not parse a suggestion from the model response' }, { status: 502 });
  }

  return NextResponse.json(suggestion);
}
