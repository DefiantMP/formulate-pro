import Anthropic from '@anthropic-ai/sdk';

export type ToleranceType = 'absolute' | 'percent';

export interface ScaleVerificationRecord {
  id: string;
  organizationId: string;
  runId: string;
  // Populated when the API includes the Run relation (every GET/POST/PATCH
  // response) — kept optional here rather than required so this type
  // doesn't lie about payloads that skip the include.
  run?: { label: string } | null;
  ingredientLabel: string;
  expectedWeightG: number;
  toleranceType: ToleranceType;
  toleranceValue: number;
  aiReadingWeightG: number | null;
  operatorReadingWeightG: number | null;
  passFail: 'pass' | 'fail' | null;
  confident: boolean;
  modelNotes: string;
  photoDataUrl: string | null;
  status: 'pending' | 'approved';
  createdAt: string;
  approvedAt: string | null;
}

/**
 * Default weighing tolerance applied to every scale verification — percent
 * rather than a flat gram figure, since ingredients in a single run range
 * from a few grams (an API) to several kilograms (filler), and a flat
 * absolute tolerance would be needlessly loose on the low end or
 * unachievably tight on the high end. This specific figure is a
 * placeholder, not derived from any existing variance/tolerance concept in
 * the codebase (lib/calc-engine's VarianceRow tracks cumulative
 * step-potency drift during blending, a different concept from a single
 * weighing check) — it has not been validated against real operational
 * requirements and should be revisited with real input before this feature
 * is trusted for production weighing decisions.
 */
export const DEFAULT_TOLERANCE_PERCENT = 0.5;

/**
 * Deterministic tolerance check — the model only reads the number off the
 * photo (see runScaleReading below); it never gets to assert pass/fail
 * itself, mirroring lib/aiVerification.ts's "model reads/reasons, real code
 * computes" split. Always computed against the operator's confirmed
 * reading (operatorReadingWeightG), not the AI's raw one — the operator may
 * have corrected a misread. Null reading always yields null, never a
 * guessed pass or fail.
 */
export function computePassFail(
  expectedWeightG: number,
  toleranceType: ToleranceType,
  toleranceValue: number,
  operatorReadingWeightG: number | null
): 'pass' | 'fail' | null {
  if (operatorReadingWeightG === null) return null;
  const allowedDelta =
    toleranceType === 'percent' ? expectedWeightG * (toleranceValue / 100) : toleranceValue;
  const delta = Math.abs(operatorReadingWeightG - expectedWeightG);
  return delta <= allowedDelta ? 'pass' : 'fail';
}

export interface ScaleReadingResult {
  /** Weight shown on the display, converted to grams. Null only if the model truly could not read a number. */
  weightGrams: number | null;
  /** True only when the display was clearly legible and unambiguous. */
  confident: boolean;
  /** Short plain-English explanation a human can use to sanity-check the reading — always populated. */
  reasoning: string;
}

export type ScaleReadingOutcome =
  | { ok: true; result: ScaleReadingResult }
  | { ok: false; error: string; status: number };

export type AnthropicMessageCreator = (
  params: Anthropic.MessageCreateParamsNonStreaming
) => Promise<Anthropic.Message>;

const SYSTEM_PROMPT = `You are reading a digital or analog scale display from a photograph taken during pharmaceutical tablet manufacturing, to support a weighing verification step.

Your only job is to identify the numeric weight shown on the display, in grams:
- If the display shows a different unit (kg, oz, lb), convert it to grams and mention the conversion in your reasoning, and set confident to false since unit conversions from a photo are more error-prone.
- If the display is blank, off, obstructed, too blurry, or you cannot make out the digits with reasonable certainty, set weightGrams to null and confident to false, and explain what's wrong in reasoning.
- If more than one reading of the digits is plausible (glare, motion blur, a digit that could be a 3 or an 8, etc.), report your best-guess weightGrams but set confident to false and explain the ambiguity.
- Set confident to true only when the display is clearly legible and shows one unambiguous number in grams.
- Always populate reasoning with a short (1-3 sentence) plain-English explanation of what you saw, regardless of confidence level — a human reviewer uses this to sanity-check your reading before trusting it.

You are not told the expected weight or tolerance, and you must not judge pass/fail — that is computed separately from your reading. Respond only by calling the report_reading tool.`;

const reportReadingTool: Anthropic.Tool = {
  name: 'report_reading',
  description: 'Report the numeric weight read from the scale display photo.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      weightGrams: {
        type: ['number', 'null'],
        description: 'The weight shown on the display, in grams (convert if shown in another unit). Null only if truly unreadable.',
      },
      confident: {
        type: 'boolean',
        description: 'True only if the display is clearly legible and shows one unambiguous number.',
      },
      reasoning: {
        type: 'string',
        description: "Short explanation of what you saw and why you are/aren't confident.",
      },
    },
    required: ['weightGrams', 'confident', 'reasoning'],
    additionalProperties: false,
  },
};

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

/** Sanity bound on payload size, well under Anthropic's own image limits — keeps requests/DB rows reasonable for a Phase 1 prototype. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function isAllowedMediaType(mediaType: string): mediaType is AllowedMediaType {
  return (ALLOWED_MEDIA_TYPES as readonly string[]).includes(mediaType);
}

/**
 * Sends one photo to Claude's vision capability and gets back a read-only
 * extraction (weight + confidence + reasoning) — no pass/fail judgment.
 * Deliberately mirrors lib/chat.ts / lib/aiVerification.ts's injectable
 * AnthropicMessageCreator pattern for testability without hitting the real
 * API.
 */
export async function runScaleReading(
  input: { imageBase64: string; mediaType: string },
  createMessage: AnthropicMessageCreator
): Promise<ScaleReadingOutcome> {
  if (!input.imageBase64) {
    return { ok: false, error: 'imageBase64 is required', status: 400 };
  }
  if (!isAllowedMediaType(input.mediaType)) {
    return { ok: false, error: `Unsupported image type: ${input.mediaType}`, status: 400 };
  }
  const approxBytes = Math.ceil((input.imageBase64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image is too large', status: 400 };
  }

  let response: Anthropic.Message;
  try {
    response = await createMessage({
      model: 'claude-sonnet-5',
      max_tokens: 512,
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      tools: [reportReadingTool],
      tool_choice: { type: 'tool', name: 'report_reading' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: input.mediaType as AllowedMediaType, data: input.imageBase64 } },
            { type: 'text', text: 'Read the numeric weight shown on this scale display.' },
          ],
        },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, error: `Scale reading request failed: ${message}`, status: 502 };
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'report_reading'
  );
  if (!toolUse) {
    return { ok: false, error: 'Model did not report a reading', status: 502 };
  }

  const parsed = toolUse.input as Partial<ScaleReadingResult>;
  if (
    typeof parsed.confident !== 'boolean' ||
    typeof parsed.reasoning !== 'string' ||
    !parsed.reasoning.trim() ||
    (parsed.weightGrams !== null && typeof parsed.weightGrams !== 'number')
  ) {
    return { ok: false, error: 'Model returned a malformed reading', status: 502 };
  }

  return {
    ok: true,
    result: { weightGrams: parsed.weightGrams ?? null, confident: parsed.confident, reasoning: parsed.reasoning },
  };
}
