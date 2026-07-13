import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { CalcResult } from '@/lib/calc-engine/types';

interface VerifyRequestBody {
  mode: 'fresh' | 'regrind';
  inputs: Record<string, string>;
  result: CalcResult;
}

export interface VerifyDiscrepancy {
  field: string;
  reportedValue: number;
  computedValue: number;
  unit: string;
}

interface VerifyResult {
  status: 'confirmed' | 'discrepancy';
  notes: string;
  discrepancy: VerifyDiscrepancy | null;
}

const SYSTEM_PROMPT = `You are a quality-control arithmetic checker for a pharmaceutical tablet formulation calculator used in nutraceutical manufacturing.

You will be given the raw operator inputs and the calculator's computed outputs for one calculation — either a "fresh batch" or a "regrind" run. Your job is a narrow, mechanical check, NOT a formulation opinion:

- Independently recompute the arithmetic from the raw inputs and compare it against the provided outputs.
- Flag negative or implausible fill/filler weights.
- Flag an active-ingredient mass per tablet that exceeds the physical target tablet weight.
- Flag potency math that doesn't reconcile with the blend totals — for fresh batches, inputs.fPot is the RAW MATERIAL's purity as a percent (e.g. an assay result), NOT the active ingredient's direct % of the finished blend. The correct derivation is: raw material mg needed per tablet = targetActiveMgPerTablet / (fPot / 100); active % of blend = that mg amount / (targetWeightG × 1000) × 100. Recompute this independently and confirm it matches the reported activePercentOfBlend and active-ingredient grams.
- Flag tablet-count inconsistencies (e.g. a tablet count that doesn't follow from the reground powder weight, potency, and target mg per tablet, for regrind runs).

TWO-TIER TOLERANCE — this matters, read carefully:

Tier 1 (negligible — report status "confirmed", discrepancy: null): a difference between your independently recomputed value and the reported value that is LESS THAN 0.05% relative difference AND LESS THAN 0.05 of the field's own unit in absolute terms (0.05 mg, 0.05 g, or 0.05 percentage points, whichever applies). This tier is just floating-point noise between two independent calculations — it does not warrant showing the operator anything, so treat it as fully confirmed.

Tier 2 (needs human review — report status "discrepancy"): ANY difference at or above the Tier 1 bounds, OR an actual logic/formula error (wrong calculation approach, not just numeric drift), a negative value, a physically implausible result, or two reported fields inconsistent with each other by more than Tier 1 rounding. For Tier 2, you MUST populate the "discrepancy" object with the single largest/most significant disagreement you found: the field name (plain English, e.g. "active ingredient grams" or "active % of blend"), the value the calculator reported, the value you independently computed, and the unit. If you found more than one discrepancy, report the most significant one in the structured fields and mention the others in "notes".

Do not comment on formulation choices, ingredient selection, manufacturing practice, or anything outside pure arithmetic and physical plausibility. Respond only by calling the report_verification tool.

Field meanings:
- tabletCount: number of tablets this run should produce
- targetWeightG: target weight per tablet, in grams
- targetActiveMgPerTablet: target active-ingredient content per tablet, in mg
- totalBlendG: total weight of the full powder blend across all tablets, in grams
- ingredientGrams / ingredientPercents (fresh only): grams and % of total blend for each ingredient, keyed by ingredient id
- activePercentOfBlend (fresh only): the active ingredient's derived % of the blend by weight (NOT the same number as inputs.fPot — see above)
- regroundPowderG (regrind only): grams of ground-up old tablets being reused
- effectivePotency (regrind only): fraction (0-1) of the reground powder that is active ingredient
- freshActiveG (regrind only): grams of fresh active ingredient added on top of what's already in the regrind powder
- fillerAddG (regrind only): grams of filler added to make up the target tablet weight
- activeInOldPowderG (regrind only): grams of active ingredient already present in the reground powder
- actualMgPerTablet (regrind only): the actual verified mg of active per tablet given the above`;

const reportVerificationTool: Anthropic.Tool = {
  name: 'report_verification',
  description: 'Report the result of independently checking the calculation arithmetic.',
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
          computedValue: { type: 'number', description: 'The value you independently computed.' },
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

  const userContent = JSON.stringify(
    { mode: body.mode, inputs: body.inputs, result: body.result },
    null,
    2
  );

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      tools: [reportVerificationTool],
      tool_choice: { type: 'tool', name: 'report_verification' },
      messages: [{ role: 'user', content: userContent }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolUse) {
      return NextResponse.json({ error: 'Model did not return a verification result' }, { status: 502 });
    }

    const result = toolUse.input as VerifyResult;
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Verification request failed: ${message}` }, { status: 502 });
  }
}
