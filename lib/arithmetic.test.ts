import { describe, it, expect } from 'vitest';
import { evaluateExpression } from './arithmetic';

describe('evaluateExpression', () => {
  it('evaluates the RR77-PB9 total blend expression correctly (10887 * 0.69 = 7512.03)', () => {
    // This is the exact case that exposed the bug: the AI verifier's own
    // mental math previously claimed 10887 * 0.690 = 7511.73, which is
    // wrong — the real answer is 7512.03.
    expect(evaluateExpression('10887 * 0.69')).toBeCloseTo(7512.03, 6);
  });

  it('evaluates the RR77-PB9 raw-material-mg-per-tablet expression (60 / (76.4 / 100))', () => {
    expect(evaluateExpression('60 / (76.4 / 100)')).toBeCloseTo(78.53403141361257, 6);
  });

  it('respects operator precedence', () => {
    expect(evaluateExpression('2 + 3 * 4')).toBe(14);
  });

  it('respects parentheses over precedence', () => {
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20);
  });

  it('handles unary minus', () => {
    expect(evaluateExpression('-5 + 3')).toBe(-2);
  });

  it('handles decimals without a leading digit', () => {
    expect(evaluateExpression('.5 * 2')).toBe(1);
  });

  it('handles nested parentheses', () => {
    expect(evaluateExpression('((1 + 2) * (3 + 4))')).toBe(21);
  });

  it('throws on division by zero', () => {
    expect(() => evaluateExpression('1 / 0')).toThrow(/division by zero/i);
  });

  it('throws on invalid characters (no identifiers, no code execution)', () => {
    expect(() => evaluateExpression('process.exit()')).toThrow();
    expect(() => evaluateExpression('1 + x')).toThrow();
  });

  it('throws on malformed expressions', () => {
    expect(() => evaluateExpression('1 +')).toThrow();
    expect(() => evaluateExpression('(1 + 2')).toThrow();
    expect(() => evaluateExpression('')).toThrow();
  });
});
