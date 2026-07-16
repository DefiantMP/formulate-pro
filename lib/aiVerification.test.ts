import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { runVerification, type AnthropicMessageCreator } from './aiVerification';
import { calculateFreshBatch } from './calc-engine/calcEngine';
import { defaultIngredients } from './calc-engine/defaultFormulation';

// Real production data (RR77-PB9) — same case used in
// lib/calc-engine/tests/calcEngine.test.ts. Verified totals: totalBlendG
// 7512.03g, activePercentOfBlend ~11.3817%, active grams ~855.00g.
const rr77pb9Result = calculateFreshBatch({
  tabletCount: 10887,
  targetWeightG: 0.69,
  apis: [{ id: 'active', label: 'API', targetActiveMgPerTablet: 60, potency: { method: 'bulkPercent', percent: 76.4 } }],
  ingredients: defaultIngredients().filter((i) => i.role !== 'active'),
  fillerType: 'Emdex',
})!;

const rr77pb9Body = {
  mode: 'fresh' as const,
  inputs: {
    apis: [{ id: 'active', label: 'API', targetActiveMgPerTablet: 60, potency: { method: 'bulkPercent', percent: 76.4 } }],
    potencyMethod: 'bulkPercent',
    fTwt: '0.69',
    fTabs: '10887',
    fillerType: 'Emdex',
  },
  result: rr77pb9Result,
};

function toolUseMessage(blocks: { id: string; name: string; input: unknown }[]): Anthropic.Message {
  return {
    content: blocks.map((b) => ({ type: 'tool_use', id: b.id, name: b.name, input: b.input })),
  } as unknown as Anthropic.Message;
}

/** Builds a fake createMessage that returns each response in order, one per call. */
function scriptedCreator(responses: Anthropic.Message[]): AnthropicMessageCreator {
  let call = 0;
  return async () => {
    const response = responses[call];
    call++;
    if (!response) throw new Error('scriptedCreator ran out of canned responses');
    return response;
  };
}

describe('runVerification — RR77-PB9 (real production data)', () => {
  it('confirms correct engine output when the model uses the calculate tool for its recomputation', async () => {
    const creator = scriptedCreator([
      toolUseMessage([{ id: 't1', name: 'calculate', input: { expression: '10887 * 0.69' } }]),
      toolUseMessage([
        {
          id: 't2',
          name: 'report_verification',
          input: { status: 'confirmed', notes: 'totalBlendG matches independent recomputation.', discrepancy: null },
        },
      ]),
    ]);

    const outcome = await runVerification(rr77pb9Body, creator);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.status).toBe('confirmed');
    }
  });

  it('rejects a discrepancy claim that never went through the calculate tool — the exact bug this closes (model previously mental-mathed 10887 * 0.690 = 7511.73, the real answer is 7512.03)', async () => {
    const creator = scriptedCreator([
      toolUseMessage([
        {
          id: 't1',
          name: 'report_verification',
          input: {
            status: 'discrepancy',
            notes: 'totalBlendG does not match my calculation.',
            discrepancy: { field: 'totalBlendG', reportedValue: 7512.03, computedValue: 7511.73, unit: 'g' },
          },
        },
      ]),
    ]);

    const outcome = await runVerification(rr77pb9Body, creator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toMatch(/no deterministic computation/i);
    }
  });

  it('rejects a discrepancy whose computedValue does not match any calculate result (model invents a number after using the tool for something else)', async () => {
    const creator = scriptedCreator([
      toolUseMessage([{ id: 't1', name: 'calculate', input: { expression: '10887 * 0.69' } }]),
      toolUseMessage([
        {
          id: 't2',
          name: 'report_verification',
          input: {
            status: 'discrepancy',
            notes: 'Fabricated mismatch not backed by a tool call.',
            discrepancy: { field: 'totalBlendG', reportedValue: 7512.03, computedValue: 7511.73, unit: 'g' },
          },
        },
      ]),
    ]);

    const outcome = await runVerification(rr77pb9Body, creator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toMatch(/does not match any deterministic calculation/i);
    }
  });

  it('accepts a genuine discrepancy whose computedValue traces back to a real calculate call', async () => {
    const corruptedBody = {
      ...rr77pb9Body,
      result: { ...rr77pb9Result, totalBlendG: 9999 },
    };
    const creator = scriptedCreator([
      toolUseMessage([{ id: 't1', name: 'calculate', input: { expression: '10887 * 0.69' } }]),
      toolUseMessage([
        {
          id: 't2',
          name: 'report_verification',
          input: {
            status: 'discrepancy',
            notes: 'Reported totalBlendG of 9999 does not match 10887 * 0.69.',
            discrepancy: { field: 'totalBlendG', reportedValue: 9999, computedValue: 7512.03, unit: 'g' },
          },
        },
      ]),
    ]);

    const outcome = await runVerification(corruptedBody, creator);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.status).toBe('discrepancy');
      expect(outcome.result.discrepancy?.computedValue).toBeCloseTo(7512.03, 2);
    }
  });

  it('rejects when the model never calls any tool at all', async () => {
    const creator = scriptedCreator([{ content: [{ type: 'text', text: 'looks fine to me' }] } as unknown as Anthropic.Message]);
    const outcome = await runVerification(rr77pb9Body, creator);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toMatch(/did not call a tool/i);
    }
  });
});
