/**
 * Minimal, dependency-free arithmetic expression evaluator: numbers, +, -,
 * *, /, unary +/-, and parentheses. No identifiers, no function calls, no
 * `eval`/`Function` — just a hand-rolled tokenizer + recursive-descent
 * parser, so it's safe to run on strings written by an LLM.
 *
 * Used by the AI verification route as a real "calculate" tool: the model
 * writes the expression, this function does the actual floating-point
 * arithmetic, so the reported numbers come from deterministic code instead
 * of the model's own mental math.
 */
export function evaluateExpression(expression: string): number {
  const tokens = tokenize(expression);
  let pos = 0;

  function peek(): string | undefined {
    return tokens[pos];
  }
  function consume(): string {
    const t = tokens[pos];
    if (t === undefined) throw new Error('Unexpected end of expression');
    pos++;
    return t;
  }

  function parseExpression(): number {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseUnary();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const rhs = parseUnary();
      if (op === '/') {
        if (rhs === 0) throw new Error('Division by zero');
        value = value / rhs;
      } else {
        value = value * rhs;
      }
    }
    return value;
  }

  function parseUnary(): number {
    if (peek() === '-') {
      consume();
      return -parseUnary();
    }
    if (peek() === '+') {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const t = consume();
    if (t === '(') {
      const value = parseExpression();
      if (consume() !== ')') throw new Error('Expected closing parenthesis');
      return value;
    }
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error(`Invalid number: "${t}"`);
    return n;
  }

  if (tokens.length === 0) throw new Error('Empty expression');
  const result = parseExpression();
  if (pos !== tokens.length) throw new Error(`Unexpected token: "${tokens[pos]}"`);
  if (!Number.isFinite(result)) throw new Error('Expression did not evaluate to a finite number');
  return result;
}

function tokenize(expression: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if ('+-*/()'.includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expression.length && /[0-9.]/.test(expression[j])) j++;
      const numStr = expression.slice(i, j);
      if (!/^\d+\.?\d*$|^\.\d+$/.test(numStr)) {
        throw new Error(`Invalid number literal: "${numStr}"`);
      }
      tokens.push(numStr);
      i = j;
      continue;
    }
    throw new Error(`Invalid character in expression: "${ch}"`);
  }
  return tokens;
}
