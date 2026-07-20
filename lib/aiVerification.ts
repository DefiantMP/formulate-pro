import Anthropic from '@anthropic-ai/sdk';
import type { CalcResult } from '@/lib/calc-engine/types';
import { evaluateExpression } from '@/lib/arithmetic';

export interface VerifyRequestBody {
  mode: 'fresh' | 'regrind';
  /** Raw operator input snapshot, JSON-stringified for the model — shape varies by mode (see SYSTEM_PROMPT field meanings), not a flat string map. */
  inputs: Record<string, unknown>;
  result: CalcResult;
}

export interface VerifyDiscrepancy {
  field: string;
  reportedValue: number;
  computedValue: number;
  unit: string;
}

export interface VerifyResult {
  status: 'confirmed' | 'discrepancy';
  notes: string;
  discrepancy: VerifyDiscrepancy | null;
}

const SYSTEM_PROMPT = `You are a quality-control arithmetic checker for a pharmaceutical tablet formulation calculator used in nutraceutical manufacturing.

You will be given the raw operator inputs and the calculator's computed outputs for one calculation — either a "fresh batch" or a "regrind" run. Your job is a narrow, mechanical check, NOT a formulation opinion:

- Independently recompute the arithmetic from the raw inputs and compare it against the provided outputs.
- Flag negative or implausible fill/filler weights.
- Flag an active-ingredient mass per tablet that exceeds the physical target tablet weight.
- Flag potency math that doesn't reconcile with the blend totals — for fresh batches, each API's potency (inputs.apis[].potency / result.apis[].effectivePotency) is that API's RAW MATERIAL's purity, NOT its direct % of the finished blend. Potency may be expressed as a bulk percent (percent / 100) or as mg per unit weight (mgPerUnit ÷ (unitWeightG × 1000)) — either way it resolves to a 0-1 fraction. The correct derivation per API: raw material mg needed per tablet = that API's targetActiveMgPerTablet ÷ its own potency fraction; that API's % of blend = that mg amount ÷ (targetWeightG × 1000) × 100.
- Fresh batches may carry more than one API — a combo product dosing multiple actives independently in the same tablet (inputs.apis / result.apis). The reported activePercentOfBlend must equal the SUM, across all APIs, of each API's own % of blend computed as above — recompute each API's contribution independently via calculate, then sum them, and confirm the total matches. Do not assume a single potency applies across every API when more than one is present. Likewise result.targetActiveMgPerTablet for a fresh batch is the SUM of every API's own targetActiveMgPerTablet, not a single dose.
- Flag tablet-count inconsistencies (e.g. a tablet count that doesn't follow from the reground powder weight, potency, and target mg per tablet, for regrind runs).
- Regrind runs may blend multiple lots of ground-up old tablets, each with its own potency and weight (inputs.lots / result.lots). The reported activeInOldPowderG must equal the SUM, across all lots, of (that lot's weightG × that lot's own effectivePotency) — recompute each lot's contribution independently via calculate, then sum them, and confirm the total matches. Do not assume a single potency applies to the whole reground powder weight when more than one lot is present. A lot flagged isStart is still included in this sum — it is not excluded, only lower-confidence.

YOU DO NOT DO ARITHMETIC YOURSELF. You have a "calculate" tool that evaluates a real arithmetic expression with real floating-point code — you MUST call it for every multiplication, division, addition, or subtraction in your independent recomputation, including intermediate steps. Never write a computed number into report_verification (as reportedValue, computedValue, or inside notes) unless that exact number came back from a calculate tool call in this conversation, and quote it to at least 2 decimal places from the tool's result rather than rounding coarsely. You may call calculate as many times as you need, one expression per call (you can chain a full formula into a single expression using parentheses, e.g. "60 / (76.4 / 100)"). Only call report_verification once you are done computing.

TWO-TIER TOLERANCE — this matters, read carefully:

Tier 1 (negligible — report status "confirmed", discrepancy: null): a difference between your independently recomputed value (from calculate) and the reported value that is LESS THAN 0.05% relative difference AND LESS THAN 0.05 of the field's own unit in absolute terms (0.05 mg, 0.05 g, or 0.05 percentage points, whichever applies). This tier is just floating-point noise between two independent calculations — it does not warrant showing the operator anything, so treat it as fully confirmed.

Tier 2 (needs human review — report status "discrepancy"): ANY difference at or above the Tier 1 bounds, OR an actual logic/formula error (wrong calculation approach, not just numeric drift), a negative value, a physically implausible result, or two reported fields inconsistent with each other by more than Tier 1 rounding. For Tier 2, you MUST populate the "discrepancy" object with the single largest/most significant disagreement you found: the field name (plain English, e.g. "active ingredient grams" or "active % of blend"), the value the calculator reported, the value you independently computed (from a calculate call), and the unit. If you found more than one discrepancy, report the most significant one in the structured fields and mention the others in "notes".

Do not comment on formulation choices, ingredient selection, manufacturing practice, or anything outside pure arithmetic and physical plausibility. Respond only by calling tools.

Field meanings:
- tabletCount: number of tablets this run should produce
- targetWeightG: target weight per tablet, in grams
- targetActiveMgPerTablet: target active-ingredient content per tablet, in mg — for fresh batches this is the SUM across all APIs (see below)
- totalBlendG: total weight of the full powder blend across all tablets, in grams
- apis (fresh only): array of { id, label, targetActiveMgPerTablet, effectivePotency (0-1 fraction), percentOfBlend, gramsPerRun }. percentOfBlend for each API = (targetActiveMgPerTablet ÷ effectivePotency) ÷ (targetWeightG × 1000) × 100. gramsPerRun = totalBlendG × (percentOfBlend ÷ 100).
- ingredientGrams / ingredientPercents (fresh only): grams and % of total blend for every API (keyed by that API's id, same values as apis[].gramsPerRun/percentOfBlend) plus every non-API ingredient (filler + fixed excipients), keyed by ingredient id
- activePercentOfBlend (fresh only): the SUM of every API's percentOfBlend (see apis above) — NOT the same number as any single API's raw potency input
- fillerType (fresh only): which filler was used (e.g. "Emdex" or "Dipac") — informational record-keeping only, never part of any calculation, ignore it for verification purposes
- regroundPowderG (regrind only): the operator-entered total grams of ground-up old tablets being reused — this is the authoritative mass used everywhere below, even if it doesn't exactly equal the sum of lot weights
- lots (regrind only): array of { id, label, effectivePotency (0-1 fraction), weightG, activeContentG, isStart, fillerType, sourceType }. activeContentG for each lot = weightG × effectivePotency. fillerType is a free-text label (e.g. "EasyTab") — informational record-keeping only, never part of any calculation, ignore it for verification purposes. sourceType is either "regroundTablets" or "rawPowder" — it does not affect activeContentG/effectivePotency, but DOES affect lubricantTopUpG below (only "regroundTablets" lots count toward that).
- lotWeightSum (regrind only): sum of lots[].weightG — a cross-check figure, not the mass used in the math (that's regroundPowderG)
- regroundPowderMismatch (regrind only): boolean flag, true when regroundPowderG disagrees with lotWeightSum beyond a small tolerance — this is an expected/valid state, not itself an arithmetic error to flag, unless the reported boolean is wrong given the two numbers
- effectivePotency (regrind only): the BLENDED fraction (0-1) of the reground powder that is active ingredient — equals activeInOldPowderG ÷ regroundPowderG
- freshActiveG (regrind only): grams of fresh active ingredient added on top of what's already in the regrind powder
- lubricantTopUpG (regrind only): grams of a fresh lubricant top-up (e.g. Magnesium stearate), even though most of that ingredient is otherwise assumed already present in the reground powder. Only lots with sourceType "regroundTablets" count toward this — raw/bulk powder lots (sourceType "rawPowder") contribute nothing. Formula: tabletCount × targetWeightG × 0.01 × (sum of weightG for lots where sourceType is "regroundTablets" ÷ lotWeightSum). If every lot is "regroundTablets" the fraction is 1 (the simple 1%-of-blend case); if every lot is "rawPowder" this is exactly 0 and no top-up should be reported at all. This amount is carved OUT of fillerAddG (redistributed, not additive), so totalBlendG = regroundPowderG + freshActiveG + fillerAddG + lubricantTopUpG.
- fillerAddG (regrind only): grams of filler added to make up the target tablet weight — already net of the 1% lubricantTopUpG above, i.e. filler + lubricant top-up together account for "the rest of the tablet weight" beyond the regrind/fresh active portion
- activeInOldPowderG (regrind only): total grams of active ingredient already present in the reground powder — the SUM of every lot's activeContentG (see above), not a single potency × regroundPowderG multiplication when multiple lots are present
- actualMgPerTablet (regrind only): the actual verified mg of active per tablet given the above`;

const calculateTool: Anthropic.Tool = {
  name: 'calculate',
  description:
    'Evaluate a pure arithmetic expression with real, deterministic floating-point code and return the result. Supports +, -, *, /, unary minus, parentheses, and decimal numbers. Use this for every arithmetic step of your independent recomputation — you cannot do math yourself.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'A pure arithmetic expression, e.g. "60 / (76.4 / 100)" or "10887 * 0.69".',
      },
    },
    required: ['expression'],
    additionalProperties: false,
  },
};

const reportVerificationTool: Anthropic.Tool = {
  name: 'report_verification',
  description:
    'Report the result of independently checking the calculation arithmetic. Every numeric value here must trace back to a prior calculate tool call.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['confirmed', 'discrepancy'] },
      notes: { type: 'string', description: 'One or two sentences explaining the check and finding.' },
      discrepancy: {
        type: ['object', 'null'],
        description: 'Required and populated when status is "discrepancy"; null when status is "confirmed".',
        properties: {
          field: { type: 'string', description: 'Plain-English name of the quantity that disagreed.' },
          reportedValue: { type: 'number', description: 'The value the calculator reported.' },
          computedValue: {
            type: 'number',
            description: 'The value you independently computed — must be a value returned by a calculate call.',
          },
          unit: { type: 'string', description: 'Unit for both values, e.g. "g", "mg", "%".' },
        },
        required: ['field', 'reportedValue', 'computedValue', 'unit'],
        additionalProperties: false,
      },
    },
    required: ['status', 'notes', 'discrepancy'],
    additionalProperties: false,
  },
};

const MAX_TURNS = 10;

/**
 * Confirms a reported computedValue actually traces back to a real
 * `calculate` call, rather than a number the model invented. Deliberately a
 * tight absolute bound (matching the "0.05 of the field's own unit" Tier-1
 * language in the system prompt) rather than a relative one — a 0.3 g error
 * on a ~7500 g total is only ~0.004% relative but is exactly the kind of
 * small, wrong mental-math slip this check exists to catch.
 */
function isCloseEnough(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.05;
}

export type AnthropicMessageCreator = (
  params: Anthropic.MessageCreateParamsNonStreaming
) => Promise<Anthropic.Message>;

export type VerificationOutcome =
  | { ok: true; result: VerifyResult }
  | { ok: false; error: string; status: number };

/**
 * Runs the model↔tool conversation loop. The model orchestrates which
 * quantities to check and in what order, but every arithmetic step must go
 * through the `calculate` tool, which this function executes with real code
 * (see lib/arithmetic.ts). Before returning a result, it verifies that any
 * discrepancy the model reports actually traces back to a calculate call —
 * if the model tries to report a number it never computed, the request is
 * rejected rather than surfaced to the operator, closing the exact failure
 * mode where the model's own mental arithmetic was wrong.
 */
export async function runVerification(
  body: VerifyRequestBody,
  createMessage: AnthropicMessageCreator
): Promise<VerificationOutcome> {
  const userContent = JSON.stringify({ mode: body.mode, inputs: body.inputs, result: body.result }, null, 2);

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userContent }];
  const calculatorResults: { expression: string; result: number }[] = [];

  let finalResult: VerifyResult | null = null;

  try {
    for (let turn = 0; turn < MAX_TURNS && !finalResult; turn++) {
      const response = await createMessage({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        output_config: { effort: 'low' },
        system: SYSTEM_PROMPT,
        tools: [calculateTool, reportVerificationTool],
        tool_choice: { type: 'any' },
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );
      if (toolUses.length === 0) {
        return { ok: false, error: 'Model did not call a tool', status: 502 };
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        if (toolUse.name === 'calculate') {
          const { expression } = toolUse.input as { expression: string };
          try {
            const result = evaluateExpression(expression);
            calculatorResults.push({ expression, result });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ result }),
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Invalid expression';
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Error: ${message}`,
              is_error: true,
            });
          }
        } else if (toolUse.name === 'report_verification') {
          finalResult = toolUse.input as VerifyResult;
        }
      }

      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, error: `Verification request failed: ${message}`, status: 502 };
  }

  if (!finalResult) {
    return { ok: false, error: 'Verification did not complete in time', status: 502 };
  }

  // Integrity gate: the model must have actually used the calculator, and
  // any discrepancy it reports must trace back to a real calculate result —
  // otherwise we're back to trusting the model's own mental math.
  if (calculatorResults.length === 0) {
    return { ok: false, error: 'Verification performed no deterministic computation', status: 502 };
  }
  if (finalResult.status === 'discrepancy') {
    if (!finalResult.discrepancy) {
      return { ok: false, error: 'Discrepancy status reported with no discrepancy detail', status: 502 };
    }
    const traces = calculatorResults.some((c) => isCloseEnough(c.result, finalResult!.discrepancy!.computedValue));
    if (!traces) {
      return {
        ok: false,
        error: 'Reported computed value does not match any deterministic calculation performed',
        status: 502,
      };
    }
  }

  return { ok: true, result: finalResult };
}
