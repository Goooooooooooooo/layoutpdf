import type { JsonValue } from '@/engine/core/document.js';

export type FormulaValue = number | readonly number[];

export type FormulaNode =
  | { kind: 'number'; value: number }
  | { kind: 'reference'; name: string }
  | { kind: 'unary'; operator: '+' | '-'; operand: FormulaNode }
  | {
      kind: 'binary';
      operator: '+' | '-' | '*' | '/' | '%' | '^' | '=' | '!=' | '<' | '<=' | '>' | '>=';
      left: FormulaNode;
      right: FormulaNode;
    }
  | { kind: 'call'; name: string; args: FormulaNode[] };

export interface FormulaScope {
  resolve(name: string): FormulaValue | string | undefined;
  call?(
    name: string,
    args: readonly FormulaNode[],
    evaluate: (node: FormulaNode, scope?: FormulaScope) => FormulaValue,
  ): FormulaValue | undefined;
}

export type FormulaValueKind = 'scalar' | 'array';

export interface ValidateFormulaOptions {
  allowedFunctions?: readonly string[];
  referenceKinds?: ReadonlyMap<string, FormulaValueKind>;
}

export const DEFAULT_FORMULA_FUNCTIONS = [
  'SUM',
  'AVERAGE',
  'MIN',
  'MAX',
  'COUNT',
  'ROUND',
  'ROUNDUP',
  'ROUNDDOWN',
  'FLOOR',
  'CEIL',
  'PERCENT',
  'ABS',
  'IF',
] as const;

function encodeFormulaReferenceSegment(value: string): string {
  let encoded = '';
  for (let index = 0; index < value.length; index++) {
    encoded += value.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return `id_${encoded}`;
}

export function createFormulaOutputReference(
  sourceElementId: string,
  outputId: string,
): string {
  return `output.${encodeFormulaReferenceSegment(sourceElementId)}.${encodeFormulaReferenceSegment(outputId)}`;
}

type Token =
  | { type: 'number'; value: number }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '%' | '^' | '=' | '!=' | '<' | '<=' | '>' | '>=' }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma' };

const IDENTIFIER_START = /[\p{L}_]/u;
const IDENTIFIER_PART = /[\p{L}\p{N}_]/u;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (IDENTIFIER_START.test(character)) {
      let identifier = '';
      while (index < source.length) {
        const part = source[index];
        if (IDENTIFIER_PART.test(part)) {
          identifier += part;
          index += 1;
          continue;
        }
        if (
          part === '.'
          && IDENTIFIER_START.test(source[index + 1] ?? '')
          && identifier.length > 0
        ) {
          identifier += part;
          index += 1;
          continue;
        }
        if (
          part === '-'
          && identifier.includes('.')
          && IDENTIFIER_PART.test(source[index + 1] ?? '')
        ) {
          identifier += part;
          index += 1;
          continue;
        }
        break;
      }
      tokens.push({ type: 'identifier', value: identifier });
      continue;
    }
    if (/[0-9.]/.test(character)) {
      let raw = '';
      while (index < source.length && /[0-9.]/.test(source[index])) {
        raw += source[index];
        index += 1;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number: ${raw}`);
      tokens.push({ type: 'number', value });
      continue;
    }
    const pair = source.slice(index, index + 2);
    if (pair === '!=' || pair === '<=' || pair === '>=' || pair === '==') {
      tokens.push({
        type: 'operator',
        value: pair === '==' ? '=' : pair,
      });
      index += 2;
      continue;
    }
    if ('+-*/%^=<>'.includes(character)) {
      tokens.push({
        type: 'operator',
        value: character as Extract<Token, { type: 'operator' }>['value'],
      });
      index += 1;
      continue;
    }
    if (character === '(' || character === ')') {
      tokens.push({ type: 'paren', value: character });
      index += 1;
      continue;
    }
    if (character === ',') {
      tokens.push({ type: 'comma' });
      index += 1;
      continue;
    }
    throw new Error(`Invalid token: ${character}`);
  }
  return tokens;
}

class FormulaParser {
  private position = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): FormulaNode {
    const node = this.parseComparison();
    if (this.peek()) throw new Error('Formula contains unexpected tokens.');
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private consume(): Token | undefined {
    const token = this.peek();
    if (token) this.position += 1;
    return token;
  }

  private parseComparison(): FormulaNode {
    let node = this.parseAdditive();
    while (true) {
      const token = this.peek();
      if (token?.type !== 'operator' || !['=', '!=', '<', '<=', '>', '>='].includes(token.value)) break;
      const operator = token.value;
      this.consume();
      node = {
        kind: 'binary',
        operator,
        left: node,
        right: this.parseAdditive(),
      };
    }
    return node;
  }

  private parseAdditive(): FormulaNode {
    let node = this.parseMultiplicative();
    while (true) {
      const token = this.peek();
      if (token?.type !== 'operator' || (token.value !== '+' && token.value !== '-')) break;
      const operator = token.value;
      this.consume();
      node = {
        kind: 'binary',
        operator,
        left: node,
        right: this.parseMultiplicative(),
      };
    }
    return node;
  }

  private parseMultiplicative(): FormulaNode {
    let node = this.parsePower();
    while (true) {
      const token = this.peek();
      if (token?.type !== 'operator' || !['*', '/', '%'].includes(token.value)) break;
      const operator = token.value as '*' | '/' | '%';
      this.consume();
      node = {
        kind: 'binary',
        operator,
        left: node,
        right: this.parsePower(),
      };
    }
    return node;
  }

  private parsePower(): FormulaNode {
    const left = this.parseUnary();
    const token = this.peek();
    if (token?.type !== 'operator' || token.value !== '^') return left;
    this.consume();
    return {
      kind: 'binary',
      operator: '^',
      left,
      right: this.parsePower(),
    };
  }

  private parseUnary(): FormulaNode {
    const token = this.peek();
    if (token?.type === 'operator' && (token.value === '+' || token.value === '-')) {
      this.consume();
      return {
        kind: 'unary',
        operator: token.value,
        operand: this.parseUnary(),
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaNode {
    const token = this.consume();
    if (!token) throw new Error('Expected factor: number, field, or function.');
    if (token.type === 'number') return { kind: 'number', value: token.value };
    if (token.type === 'identifier') {
      const open = this.peek();
      if (open?.type !== 'paren' || open.value !== '(') {
        return { kind: 'reference', name: token.value };
      }
      this.consume();
      const args: FormulaNode[] = [];
      const possibleClose = this.peek();
      if (possibleClose?.type === 'paren' && possibleClose.value === ')') {
        this.consume();
        return { kind: 'call', name: token.value.toUpperCase(), args };
      }
      while (true) {
        args.push(this.parseComparison());
        if (this.peek()?.type === 'comma') {
          this.consume();
          continue;
        }
        const close = this.consume();
        if (close?.type !== 'paren' || close.value !== ')') throw new Error('Expected , or ).');
        break;
      }
      return { kind: 'call', name: token.value.toUpperCase(), args };
    }
    if (token.type === 'paren' && token.value === '(') {
      const node = this.parseComparison();
      const close = this.consume();
      if (close?.type !== 'paren' || close.value !== ')') throw new Error('Expected ).');
      return node;
    }
    throw new Error('Expected factor: number, field, or function.');
  }
}

export function parseFormula(expression: string): FormulaNode {
  const tokens = tokenize(expression);
  if (tokens.length === 0) throw new Error('Formula is empty.');
  return new FormulaParser(tokens).parse();
}

function literalNumber(node: FormulaNode): number | undefined {
  if (node.kind === 'number') return node.value;
  if (node.kind !== 'unary') return undefined;
  const value = literalNumber(node.operand);
  if (value === undefined) return undefined;
  return node.operator === '-' ? -value : value;
}

export function validateFormula(
  expression: string,
  options: ValidateFormulaOptions = {},
): FormulaNode {
  const root = parseFormula(expression);
  const allowedFunctions = options.allowedFunctions
    ? new Set(options.allowedFunctions.map(name => name.toUpperCase()))
    : undefined;
  const requireArity = (
    name: string,
    args: readonly FormulaNode[],
    minimum: number,
    maximum = minimum,
  ) => {
    if (args.length < minimum || args.length > maximum) {
      const expected = minimum === maximum ? String(minimum) : `${minimum} or ${maximum}`;
      throw new Error(`${name} requires ${expected} argument${maximum === 1 ? '' : 's'}.`);
    }
  };
  const requireScalar = (kind: FormulaValueKind, context: string) => {
    if (kind === 'array') throw new Error(`${context} requires a single numeric value.`);
  };
  const visit = (node: FormulaNode): FormulaValueKind => {
    if (node.kind === 'number') return 'scalar';
    if (node.kind === 'reference') {
      if (!options.referenceKinds) return 'scalar';
      const kind = options.referenceKinds.get(node.name);
      if (!kind) throw new Error(`Unknown formula field: ${node.name}.`);
      return kind;
    }
    if (node.kind === 'unary') {
      const kind = visit(node.operand);
      requireScalar(kind, `Operator ${node.operator}`);
      return 'scalar';
    }
    if (node.kind === 'binary') {
      requireScalar(visit(node.left), `Operator ${node.operator}`);
      requireScalar(visit(node.right), `Operator ${node.operator}`);
      return 'scalar';
    }

    if (allowedFunctions && !allowedFunctions.has(node.name)) {
      throw new Error(`Unknown formula function: ${node.name}.`);
    }
    if (['SUM', 'AVERAGE', 'AVG', 'MIN', 'MAX', 'COUNT'].includes(node.name)) {
      node.args.forEach(visit);
      return 'scalar';
    }
    if (node.name === 'PERCENT' || node.name === 'ABS') {
      requireArity(node.name, node.args, 1);
      requireScalar(visit(node.args[0]), node.name);
      return 'scalar';
    }
    if (['ROUND', 'ROUNDUP', 'ROUNDDOWN', 'FLOOR', 'CEIL'].includes(node.name)) {
      requireArity(node.name, node.args, 1, 2);
      requireScalar(visit(node.args[0]), node.name);
      if (node.args[1]) {
        requireScalar(visit(node.args[1]), `${node.name} decimal places`);
        const places = literalNumber(node.args[1]);
        if (places !== undefined && (!Number.isInteger(places) || places < 0 || places > 10)) {
          throw new Error(`${node.name} decimal places must be an integer from 0 to 10.`);
        }
      }
      return 'scalar';
    }
    if (node.name === 'IF') {
      requireArity(node.name, node.args, 3);
      node.args.forEach((argument, index) => {
        requireScalar(visit(argument), index === 0 ? 'IF condition' : 'IF result');
      });
      return 'scalar';
    }
    if (node.name === 'ROW_NUMBER') {
      requireArity(node.name, node.args, 0);
      return 'scalar';
    }
    if (node.name === 'RUNNING_SUM') {
      requireArity(node.name, node.args, 1);
      requireScalar(visit(node.args[0]), node.name);
      return 'scalar';
    }
    node.args.forEach(argument => requireScalar(visit(argument), node.name));
    return 'scalar';
  };
  requireScalar(visit(root), 'Formula result');
  return root;
}

export function getFormulaReferences(expression: string): string[] {
  const references = new Set<string>();
  const visit = (node: FormulaNode): void => {
    if (node.kind === 'reference') references.add(node.name);
    else if (node.kind === 'unary') visit(node.operand);
    else if (node.kind === 'binary') {
      visit(node.left);
      visit(node.right);
    } else if (node.kind === 'call') {
      node.args.forEach(visit);
    }
  };
  visit(parseFormula(expression));
  return [...references];
}

export function getFormulaFunctions(expression: string): string[] {
  const functions = new Set<string>();
  const visit = (node: FormulaNode): void => {
    if (node.kind === 'unary') visit(node.operand);
    else if (node.kind === 'binary') {
      visit(node.left);
      visit(node.right);
    } else if (node.kind === 'call') {
      functions.add(node.name);
      node.args.forEach(visit);
    }
  };
  visit(parseFormula(expression));
  return [...functions];
}

export function renameFormulaReferences(
  expression: string,
  replacements: ReadonlyMap<string, string>,
): string {
  return expression.replace(
    /[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_-]*)*/gu,
    reference => replacements.get(reference) ?? reference,
  );
}

function scalar(value: FormulaValue | string, context: string): number {
  if (typeof value === 'object') throw new Error(`${context} requires a single numeric value.`);
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result)) {
    if (typeof value === 'number') throw new Error(`${context} is not finite.`);
    throw new Error(`${context} is not numeric.`);
  }
  return result;
}

function flatten(values: readonly FormulaValue[]): number[] {
  return values.flatMap(value => Array.isArray(value) ? [...value] : [value]);
}

function decimalPlaces(
  values: readonly FormulaValue[],
  functionName: string,
): number {
  const places = values[1] === undefined
    ? 0
    : scalar(values[1], `${functionName} decimal places`);
  if (!Number.isInteger(places) || places < 0 || places > 10) {
    throw new Error(`${functionName} decimal places must be an integer from 0 to 10.`);
  }
  return places;
}

function evaluateRoundingCall(
  name: 'ROUND' | 'ROUNDUP' | 'ROUNDDOWN' | 'FLOOR' | 'CEIL',
  values: readonly FormulaValue[],
): number {
  if (values.length < 1 || values.length > 2) {
    throw new Error(`${name} requires one or two values.`);
  }
  const value = scalar(values[0], name);
  const places = decimalPlaces(values, name);
  const factor = 10 ** places;
  const scaled = value * factor;
  let rounded: number;
  if (name === 'ROUND') rounded = Math.round(scaled);
  else if (name === 'ROUNDUP') rounded = Math.sign(scaled) * Math.ceil(Math.abs(scaled));
  else if (name === 'ROUNDDOWN') rounded = Math.sign(scaled) * Math.floor(Math.abs(scaled));
  else if (name === 'FLOOR') rounded = Math.floor(scaled);
  else rounded = Math.ceil(scaled);
  return rounded / factor;
}

function evaluateBuiltInCall(
  node: Extract<FormulaNode, { kind: 'call' }>,
  scope: FormulaScope,
  evaluate: (child: FormulaNode, childScope?: FormulaScope) => FormulaValue,
): FormulaValue {
  if (node.name === 'IF') {
    if (node.args.length !== 3) throw new Error('IF requires condition, true value, and false value.');
    return scalar(evaluate(node.args[0]), 'IF condition') !== 0
      ? evaluate(node.args[1])
      : evaluate(node.args[2]);
  }
  const values = node.args.map(argument => evaluate(argument));
  const numbers = flatten(values);
  if (node.name === 'SUM') return numbers.reduce((total, value) => total + value, 0);
  if (node.name === 'AVERAGE' || node.name === 'AVG') {
    if (numbers.length === 0) return 0;
    return numbers.reduce((total, value) => total + value, 0) / numbers.length;
  }
  if (node.name === 'MIN') {
    if (numbers.length === 0) return 0;
    return Math.min(...numbers);
  }
  if (node.name === 'MAX') {
    if (numbers.length === 0) return 0;
    return Math.max(...numbers);
  }
  if (node.name === 'COUNT') return numbers.length;
  if (node.name === 'PERCENT') {
    if (values.length !== 1) throw new Error('PERCENT requires one value.');
    return scalar(values[0], 'PERCENT') / 100;
  }
  if (node.name === 'ABS') {
    if (values.length !== 1) throw new Error('ABS requires one value.');
    return Math.abs(scalar(values[0], 'ABS'));
  }
  if (
    node.name === 'ROUND'
    || node.name === 'ROUNDUP'
    || node.name === 'ROUNDDOWN'
    || node.name === 'FLOOR'
    || node.name === 'CEIL'
  ) {
    return evaluateRoundingCall(node.name, values);
  }
  const custom = scope.call?.(node.name, node.args, evaluate);
  if (custom !== undefined) return custom;
  throw new Error(`Unknown formula function: ${node.name}.`);
}

export function evaluateFormulaNode(node: FormulaNode, scope: FormulaScope): FormulaValue {
  const evaluate = (child: FormulaNode, childScope = scope): FormulaValue =>
    evaluateFormulaNode(child, childScope);
  if (node.kind === 'number') return node.value;
  if (node.kind === 'reference') {
    const value = scope.resolve(node.name);
    if (value === undefined) throw new Error(`Unknown formula field: ${node.name}.`);
    if (Array.isArray(value)) return value.map(item => scalar(item, node.name));
    return scalar(value, node.name);
  }
  if (node.kind === 'unary') {
    const value = scalar(evaluate(node.operand), `Operator ${node.operator}`);
    return node.operator === '-' ? -value : value;
  }
  if (node.kind === 'call') return evaluateBuiltInCall(node, scope, evaluate);

  const left = scalar(evaluate(node.left), `Operator ${node.operator}`);
  const right = scalar(evaluate(node.right), `Operator ${node.operator}`);
  if (node.operator === '+') return left + right;
  if (node.operator === '-') return left - right;
  if (node.operator === '*') return left * right;
  if (node.operator === '/') return left / right;
  if (node.operator === '%') return left % right;
  if (node.operator === '^') return left ** right;
  if (node.operator === '=') return left === right ? 1 : 0;
  if (node.operator === '!=') return left !== right ? 1 : 0;
  if (node.operator === '<') return left < right ? 1 : 0;
  if (node.operator === '<=') return left <= right ? 1 : 0;
  if (node.operator === '>') return left > right ? 1 : 0;
  return left >= right ? 1 : 0;
}

export function evaluateFormula(
  expression: string,
  scope: FormulaScope,
  decimalPlaces?: number,
): number {
  const value = evaluateFormulaNode(parseFormula(expression), scope);
  const result = scalar(value, 'Formula result');
  if (!Number.isFinite(result)) throw new Error('Formula result is not finite.');
  if (decimalPlaces === undefined) return result;
  const factor = 10 ** decimalPlaces;
  return Math.round(result * factor) / factor;
}

export function evaluateExpression(
  expression: string,
  variables: Record<string, JsonValue> = {},
  decimalPlaces = 2,
): number {
  return evaluateFormula(expression, {
    resolve(name) {
      const value = variables[name];
      if (value === undefined) return undefined;
      if (typeof value === 'number' || typeof value === 'string') return value;
      throw new Error(`${name} is not numeric.`);
    },
  }, decimalPlaces);
}
