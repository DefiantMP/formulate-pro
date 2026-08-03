import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { computePassFail, runScaleReading, type AnthropicMessageCreator, type ScaleReadingResult } from './scaleVerification';

function readingToolUseMessage(input: Partial<ScaleReadingResult>): Anthropic.Message {
  return {
    content: [{ type: 'tool_use', id: 'tu_1', name: 'report_reading', input }],
  } as unknown as Anthropic.Message;
}

function recordingCreator(
  response: Anthropic.Message
): { creator: AnthropicMessageCreator; calls: Anthropic.MessageCreateParamsNonStreaming[] } {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const creator: AnthropicMessageCreator = async (params) => {
    calls.push(params);
    return response;
  };
  return { creator, calls };
}

describe('computePassFail', () => {
  it('passes when within absolute tolerance, including exactly at the boundary', () => {
    expect(computePassFail(100, 'absolute', 5, 105)).toBe('pass');
    expect(computePassFail(100, 'absolute', 5, 95)).toBe('pass');
    expect(computePassFail(100, 'absolute', 5, 100)).toBe('pass');
  });

  it('fails when outside absolute tolerance', () => {
    expect(computePassFail(100, 'absolute', 5, 105.01)).toBe('fail');
    expect(computePassFail(100, 'absolute', 5, 94.99)).toBe('fail');
  });

  it('passes/fails correctly using percent tolerance', () => {
    expect(computePassFail(200, 'percent', 2, 204)).toBe('pass'); // exactly 2% = 4g
    expect(computePassFail(200, 'percent', 2, 196)).toBe('pass');
    expect(computePassFail(200, 'percent', 2, 204.01)).toBe('fail');
  });

  it('returns null when there is no extracted reading, never a guessed pass/fail', () => {
    expect(computePassFail(100, 'absolute', 5, null)).toBeNull();
  });
});

describe('runScaleReading', () => {
  const validInput = { imageBase64: 'aGVsbG8=', mediaType: 'image/jpeg' };

  it('returns the extracted reading on a clear photo', async () => {
    const { creator } = recordingCreator(
      readingToolUseMessage({ weightGrams: 60.2, confident: true, reasoning: 'Display clearly reads 60.2 g.' })
    );
    const outcome = await runScaleReading(validInput, creator);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result).toEqual({ weightGrams: 60.2, confident: true, reasoning: 'Display clearly reads 60.2 g.' });
    }
  });

  it('sends the image as a base64 content block along with the forced tool choice', async () => {
    const { creator, calls } = recordingCreator(
      readingToolUseMessage({ weightGrams: 10, confident: true, reasoning: 'clear' })
    );
    await runScaleReading(validInput, creator);
    expect(calls).toHaveLength(1);
    expect(calls[0].tool_choice).toEqual({ type: 'tool', name: 'report_reading' });
    const content = calls[0].messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    expect((content as Anthropic.ImageBlockParam[])[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'aGVsbG8=' },
    });
  });

  it('allows a null weightGrams with confident:false for an unreadable display', async () => {
    const { creator } = recordingCreator(
      readingToolUseMessage({ weightGrams: null, confident: false, reasoning: 'Display is off / blank.' })
    );
    const outcome = await runScaleReading(validInput, creator);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.weightGrams).toBeNull();
      expect(outcome.result.confident).toBe(false);
    }
  });

  it('rejects an unsupported media type without calling the model', async () => {
    const { creator, calls } = recordingCreator(readingToolUseMessage({ weightGrams: 1, confident: true, reasoning: 'x' }));
    const outcome = await runScaleReading({ imageBase64: 'aGVsbG8=', mediaType: 'image/heic' }, creator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(400);
      expect(outcome.error).toMatch(/unsupported/i);
    }
    expect(calls).toHaveLength(0);
  });

  it('rejects a missing imageBase64 without calling the model', async () => {
    const { creator, calls } = recordingCreator(readingToolUseMessage({ weightGrams: 1, confident: true, reasoning: 'x' }));
    const outcome = await runScaleReading({ imageBase64: '', mediaType: 'image/jpeg' }, creator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects an oversized image without calling the model', async () => {
    const { creator, calls } = recordingCreator(readingToolUseMessage({ weightGrams: 1, confident: true, reasoning: 'x' }));
    const hugeBase64 = 'A'.repeat(12 * 1024 * 1024); // ~9MB decoded, over the 8MB bound
    const outcome = await runScaleReading({ imageBase64: hugeBase64, mediaType: 'image/jpeg' }, creator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(400);
      expect(outcome.error).toMatch(/too large/i);
    }
    expect(calls).toHaveLength(0);
  });

  it('returns ok:false when the model does not call the tool', async () => {
    const { creator } = recordingCreator({ content: [{ type: 'text', text: 'I see a scale.' }] } as unknown as Anthropic.Message);
    const outcome = await runScaleReading(validInput, creator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(502);
      expect(outcome.error).toMatch(/did not report/i);
    }
  });

  it('returns ok:false when the tool input is malformed', async () => {
    const { creator } = recordingCreator(readingToolUseMessage({ weightGrams: 'sixty' as unknown as number, confident: true, reasoning: 'x' }));
    const outcome = await runScaleReading(validInput, creator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(502);
      expect(outcome.error).toMatch(/malformed/i);
    }
  });

  it('returns ok:false when reasoning is missing', async () => {
    const { creator } = recordingCreator(readingToolUseMessage({ weightGrams: 10, confident: true, reasoning: '' }));
    const outcome = await runScaleReading(validInput, creator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.status).toBe(502);
  });

  it('returns ok:false when the API call throws', async () => {
    const failingCreator: AnthropicMessageCreator = async () => {
      throw new Error('network error');
    };
    const outcome = await runScaleReading(validInput, failingCreator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(502);
      expect(outcome.error).toMatch(/network error/);
    }
  });
});
