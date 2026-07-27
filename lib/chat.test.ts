import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { runChatTurn, type AnthropicMessageCreator, type ChatMessage } from './chat';

function textMessage(text: string): Anthropic.Message {
  return { content: [{ type: 'text', text, citations: null }] } as unknown as Anthropic.Message;
}

/** Records every params object passed in, then returns the given canned response. */
function recordingCreator(response: Anthropic.Message): { creator: AnthropicMessageCreator; calls: Anthropic.MessageCreateParamsNonStreaming[] } {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const creator: AnthropicMessageCreator = async (params) => {
    calls.push(params);
    return response;
  };
  return { creator, calls };
}

describe('runChatTurn', () => {
  it('returns the model\'s reply text on a normal turn', async () => {
    const { creator } = recordingCreator(textMessage('Try increasing the lubricant slightly.'));
    const outcome = await runChatTurn({ systemPrompt: 'system', history: [], userMessage: 'tablets are capping' }, creator);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.reply).toBe('Try increasing the lubricant slightly.');
    }
  });

  it('sends the system prompt and appends the new user message after prior history, in order', async () => {
    const { creator, calls } = recordingCreator(textMessage('ok'));
    const history: ChatMessage[] = [
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
    ];
    await runChatTurn({ systemPrompt: 'my system prompt', history, userMessage: 'second question' }, creator);

    expect(calls).toHaveLength(1);
    expect(calls[0].system).toBe('my system prompt');
    expect(calls[0].messages).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'second question' },
    ]);
  });

  it('rejects an empty message without calling the model', async () => {
    const { creator, calls } = recordingCreator(textMessage('unused'));
    const outcome = await runChatTurn({ systemPrompt: 'system', history: [], userMessage: '   ' }, creator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(400);
      expect(outcome.error).toMatch(/empty/i);
    }
    expect(calls).toHaveLength(0);
  });

  it('rejects a message over the length limit without calling the model', async () => {
    const { creator, calls } = recordingCreator(textMessage('unused'));
    const outcome = await runChatTurn({ systemPrompt: 'system', history: [], userMessage: 'x'.repeat(5000) }, creator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(400);
      expect(outcome.error).toMatch(/too long/i);
    }
    expect(calls).toHaveLength(0);
  });

  it('returns ok:false when the model returns no text content', async () => {
    const { creator } = recordingCreator({ content: [] } as unknown as Anthropic.Message);
    const outcome = await runChatTurn({ systemPrompt: 'system', history: [], userMessage: 'hello' }, creator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(502);
      expect(outcome.error).toMatch(/empty response/i);
    }
  });

  it('returns ok:false when the API call throws', async () => {
    const failingCreator: AnthropicMessageCreator = async () => {
      throw new Error('network error');
    };
    const outcome = await runChatTurn({ systemPrompt: 'system', history: [], userMessage: 'hello' }, failingCreator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(502);
      expect(outcome.error).toMatch(/network error/);
    }
  });
});
