import Anthropic from '@anthropic-ai/sdk';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AnthropicMessageCreator = (
  params: Anthropic.MessageCreateParamsNonStreaming
) => Promise<Anthropic.Message>;

export type ChatTurnOutcome = { ok: true; reply: string } | { ok: false; error: string; status: number };

const MAX_MESSAGE_LENGTH = 4000;

/**
 * Generic, reusable single-turn advisory chat helper — not specific to any
 * one feature. Callers supply a domain-specific systemPrompt (e.g. a
 * formulation's version history) and this runs one on-demand
 * user-message -> assistant-reply round trip, no tool-use. Deliberately NOT
 * arithmetic/tool-based like lib/aiVerification.ts's runVerification: this
 * produces qualitative advisory text, not a reported computed value, so
 * CLAUDE.md's AI-verification integrity gate (every number must trace back
 * to a real tool call) doesn't apply here — that gate is scoped to the
 * calculation-verification feature specifically. Mirrors runVerification's
 * injectable AnthropicMessageCreator for testability without hitting the
 * real API.
 */
export async function runChatTurn(
  input: { systemPrompt: string; history: ChatMessage[]; userMessage: string },
  createMessage: AnthropicMessageCreator
): Promise<ChatTurnOutcome> {
  const userMessage = input.userMessage.trim();
  if (!userMessage) {
    return { ok: false, error: 'Message cannot be empty', status: 400 };
  }
  if (userMessage.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`, status: 400 };
  }

  const messages: Anthropic.MessageParam[] = [
    ...input.history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  try {
    const response = await createMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      output_config: { effort: 'medium' },
      system: input.systemPrompt,
      messages,
    });

    const reply = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!reply) {
      return { ok: false, error: 'Model returned an empty response', status: 502 };
    }
    return { ok: true, reply };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, error: `Chat request failed: ${message}`, status: 502 };
  }
}
