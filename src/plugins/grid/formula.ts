import { evaluateFormula } from '@/utils/calc.js';
import { TEMPLATE_COMPLEXITY_LIMITS } from '@/engine/utils/limits.js';

const CELL_REF = /^([A-Z]+)([1-9]\d*)$/i;
const RANGE_REF = /^([A-Z]+)([1-9]\d*):([A-Z]+)([1-9]\d*)$/i;
const MAX_GRID_FORMULA_LENGTH = 100_000;

export interface GridFormulaCoordinate {
  rowIndex: number;
  columnIndex: number;
}

export interface GridFormulaContext {
  columnKeys?: readonly string[];
  rowCount?: number;
  validCellKeys?: ReadonlySet<string>;
  errorCellKeys?: ReadonlySet<string>;
}

function columnKeyToIndex(key: string): number {
  let index = 0;
  for (const character of key.toUpperCase()) index = index * 26 + character.charCodeAt(0) - 64;
  return index - 1;
}

export function gridColumnIndexToLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new Error('Grid column index must be a non-negative integer.');
  let result = '';
  let value = index + 1;
  while (value > 0) {
    value--;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result.toLowerCase();
}

export function gridColumnLabelToIndex(label: string): number | undefined {
  if (!/^[A-Z]+$/i.test(label)) return undefined;
  return columnKeyToIndex(label);
}

function cellReferenceToCoordinate(reference: string): GridFormulaCoordinate | undefined {
  const match = reference.match(CELL_REF);
  if (!match) return undefined;
  return {
    rowIndex: Number(match[2]) - 1,
    columnIndex: columnKeyToIndex(match[1]),
  };
}

function coordinateToCellKey(
  coordinate: GridFormulaCoordinate,
  context?: GridFormulaContext,
): string | undefined {
  if (coordinate.rowIndex < 0 || (context?.rowCount !== undefined && coordinate.rowIndex >= context.rowCount)) {
    return undefined;
  }
  const columnKey = context?.columnKeys
    ? context.columnKeys[coordinate.columnIndex]
    : gridColumnIndexToLabel(coordinate.columnIndex);
  return columnKey === undefined ? undefined : `${coordinate.rowIndex}:${columnKey}`;
}

function encodeCellKey(key: string): string {
  let encoded = '';
  for (let index = 0; index < key.length; index += 1) {
    encoded += key.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return `k_${encoded}`;
}

function decodeCellKey(encoded: string): string | undefined {
  if (!/^k_(?:[0-9a-f]{4})+$/i.test(encoded)) return undefined;
  let key = '';
  for (let index = 2; index < encoded.length; index += 4) {
    key += String.fromCharCode(Number.parseInt(encoded.slice(index, index + 4), 16));
  }
  return key;
}

function resolveRange(
  range: string,
  context?: GridFormulaContext,
): string[] | undefined {
  const match = range.match(RANGE_REF);
  if (!match) return undefined;
  const startColumn = columnKeyToIndex(match[1]);
  const startRow = Number(match[2]) - 1;
  const endColumn = columnKeyToIndex(match[3]);
  const endRow = Number(match[4]) - 1;
  if (startColumn > endColumn || startRow > endRow) return undefined;
  const rowLength = endRow - startRow + 1;
  const columnLength = endColumn - startColumn + 1;
  if (
    rowLength * columnLength > TEMPLATE_COMPLEXITY_LIMITS.maxGridCellsPerElement
    || !coordinateToCellKey({ rowIndex: startRow, columnIndex: startColumn }, context)
    || !coordinateToCellKey({ rowIndex: endRow, columnIndex: endColumn }, context)
  ) return undefined;

  const keys: string[] = [];
  for (let row = startRow; row <= endRow; row++) {
    for (let column = startColumn; column <= endColumn; column++) {
      const key = coordinateToCellKey({ rowIndex: row, columnIndex: column }, context);
      if (!key) return undefined;
      keys.push(key);
    }
  }
  return keys;
}

function countFormulaReferenceVisits(
  formula: string,
  context: GridFormulaContext,
  limit: number,
): number | undefined {
  if (formula.length > MAX_GRID_FORMULA_LENGTH) return undefined;
  let visits = 0;
  let valid = true;
  const withoutRanges = formula.slice(1).replace(
    /([A-Z]+[1-9]\d*):([A-Z]+[1-9]\d*)/gi,
    range => {
      const match = range.match(RANGE_REF);
      if (!match) return '';
      const startColumn = columnKeyToIndex(match[1]);
      const startRow = Number(match[2]) - 1;
      const endColumn = columnKeyToIndex(match[3]);
      const endRow = Number(match[4]) - 1;
      const rangeVisits = (endRow - startRow + 1) * (endColumn - startColumn + 1);
      if (
        startRow > endRow
        || startColumn > endColumn
        || !Number.isSafeInteger(rangeVisits)
        || rangeVisits < 1
        || !coordinateToCellKey({ rowIndex: startRow, columnIndex: startColumn }, context)
        || !coordinateToCellKey({ rowIndex: endRow, columnIndex: endColumn }, context)
        || visits + rangeVisits > limit
      ) valid = false;
      else visits += rangeVisits;
      return '';
    },
  );
  if (!valid) return undefined;
  for (const match of withoutRanges.matchAll(/[A-Z]+[1-9]\d*/gi)) {
    visits += 1;
    if (visits > limit) return undefined;
    const coordinate = cellReferenceToCoordinate(match[0]);
    if (!coordinate || !coordinateToCellKey(coordinate, context)) return undefined;
  }
  return visits;
}

export function getFormulaReferences(
  formula: string,
  context?: GridFormulaContext,
): string[] {
  if (!formula.startsWith('=')) return [];
  const expression = formula.slice(1).trim();
  const references = new Set<string>();
  const withoutRanges = expression.replace(
    /([A-Z]+[1-9]\d*):([A-Z]+[1-9]\d*)/gi,
    range => {
      for (const key of resolveRange(range, context) ?? []) references.add(key);
      return '';
    },
  );
  for (const match of withoutRanges.matchAll(/[A-Z]+[1-9]\d*/gi)) {
    const coordinate = cellReferenceToCoordinate(match[0]);
    const key = coordinate ? coordinateToCellKey(coordinate, context) : undefined;
    if (key) references.add(key);
  }
  return [...references];
}

export function rewriteGridFormulaReferences(
  formula: string,
  transform: (coordinate: GridFormulaCoordinate) => GridFormulaCoordinate | undefined,
): string {
  if (!formula.startsWith('=')) return formula;
  const ranges: string[] = [];
  const formatCoordinate = (coordinate: GridFormulaCoordinate | undefined) => !coordinate
    || coordinate.rowIndex < 0
    || coordinate.columnIndex < 0
    ? '#REF!'
    : `${gridColumnIndexToLabel(coordinate.columnIndex).toUpperCase()}${coordinate.rowIndex + 1}`;
  const withoutRanges = formula.replace(
    /(?<![.\p{L}\p{N}_])([A-Z]+[1-9]\d*):([A-Z]+[1-9]\d*)(?![\p{L}\p{N}_])/giu,
    (_range, rawStart: string, rawEnd: string) => {
      const start = cellReferenceToCoordinate(rawStart);
      const end = cellReferenceToCoordinate(rawEnd);
      const nextStart = start ? transform(start) : undefined;
      const nextEnd = end ? transform(end) : undefined;
      let rewritten: string;
      if (nextStart && nextEnd) {
        rewritten = `${formatCoordinate({
          rowIndex: Math.min(nextStart.rowIndex, nextEnd.rowIndex),
          columnIndex: Math.min(nextStart.columnIndex, nextEnd.columnIndex),
        })}:${formatCoordinate({
          rowIndex: Math.max(nextStart.rowIndex, nextEnd.rowIndex),
          columnIndex: Math.max(nextStart.columnIndex, nextEnd.columnIndex),
        })}`;
      } else {
        rewritten = `${formatCoordinate(nextStart)}:${formatCoordinate(nextEnd)}`;
      }
      const placeholder = `§GRID_RANGE_${ranges.length}§`;
      ranges.push(rewritten);
      return placeholder;
    },
  );
  let result = '';
  let index = 0;
  const isIdentifierPart = (value: string | undefined) => value !== undefined && /[\p{L}\p{N}_]/u.test(value);
  while (index < withoutRanges.length) {
    const start = index;
    const previous = withoutRanges[index - 1];
    if (!/[A-Z]/i.test(withoutRanges[index]) || previous === '.' || isIdentifierPart(previous)) {
      result += withoutRanges[index];
      index += 1;
      continue;
    }
    let rawColumn = '';
    while (index < withoutRanges.length && /[A-Z]/i.test(withoutRanges[index])) {
      rawColumn += withoutRanges[index];
      index += 1;
    }
    let rawRow = '';
    if (/[1-9]/.test(withoutRanges[index] ?? '')) {
      while (index < withoutRanges.length && /\d/.test(withoutRanges[index])) {
        rawRow += withoutRanges[index];
        index += 1;
      }
    }
    if (!rawRow || isIdentifierPart(withoutRanges[index])) {
      result += withoutRanges.slice(start, index);
      continue;
    }
    const next = transform({
      rowIndex: Number(rawRow) - 1,
      columnIndex: columnKeyToIndex(rawColumn),
    });
    result += formatCoordinate(next);
  }
  return ranges.reduce((value, range, rangeIndex) => value.replace(`§GRID_RANGE_${rangeIndex}§`, range), result);
}

export function rebaseFormulaAfterRowDeletion(formula: string, deletedRowIndex: number): string {
  return rewriteGridFormulaReferences(formula, coordinate => {
    if (coordinate.rowIndex === deletedRowIndex) return undefined;
    return {
      ...coordinate,
      rowIndex: coordinate.rowIndex > deletedRowIndex
        ? coordinate.rowIndex - 1
        : coordinate.rowIndex,
    };
  });
}

export function rebaseFormulaAfterColumnDeletion(formula: string, deletedColumnKey: string): string {
  const deletedColumnIndex = gridColumnLabelToIndex(deletedColumnKey);
  if (deletedColumnIndex === undefined) return formula;
  return rewriteGridFormulaReferences(formula, coordinate => {
    if (coordinate.columnIndex === deletedColumnIndex) return undefined;
    return {
      ...coordinate,
      columnIndex: coordinate.columnIndex > deletedColumnIndex
        ? coordinate.columnIndex - 1
        : coordinate.columnIndex,
    };
  });
}

function normalizeGridExpression(
  expression: string,
  context?: GridFormulaContext,
): string | undefined {
  let valid = true;
  const expandedRanges = expression.replace(
    /([A-Z]+[1-9]\d*):([A-Z]+[1-9]\d*)/gi,
    range => {
      const keys = resolveRange(range, context);
      if (!keys) {
        valid = false;
        return range;
      }
      return keys.map(key => `cell.${encodeCellKey(key)}`).join(', ');
    },
  );
  if (!valid) return undefined;
  const normalized = expandedRanges.replace(
    /(?<![.\p{L}\p{N}_])([A-Z]+[1-9]\d*)/giu,
    reference => {
      const coordinate = cellReferenceToCoordinate(reference);
      const key = coordinate ? coordinateToCellKey(coordinate, context) : undefined;
      if (!key) {
        valid = false;
        return reference;
      }
      return `cell.${encodeCellKey(key)}`;
    },
  );
  return valid ? normalized : undefined;
}

export function evaluateGridFormula(
  formula: string,
  cellValues: Record<string, number>,
  context?: GridFormulaContext,
): number | undefined {
  if (!formula.startsWith('=')) return undefined;
  const expression = formula.slice(1).trim();
  if (!expression) return undefined;
  const normalized = normalizeGridExpression(expression, context);
  if (!normalized) return undefined;
  try {
    return evaluateFormula(normalized, {
      resolve(reference) {
        if (!reference.startsWith('cell.')) return undefined;
        const key = decodeCellKey(reference.slice('cell.'.length));
        if (!key || context?.errorCellKeys?.has(key) || (context?.validCellKeys && !context.validCellKeys.has(key))) {
          return undefined;
        }
        // A missing value inside the grid is a blank cell, not zero: aggregates
        // skip blanks while arithmetic coerces them to zero.
        return cellValues[key] ?? null;
      },
    });
  } catch {
    return undefined;
  }
}

export interface GridFormulaSetResult {
  values: Record<string, number>;
  invalidKeys: ReadonlySet<string>;
  cycleKeys: ReadonlySet<string>;
}

export function evaluateGridFormulaCells(
  cellContents: Readonly<Record<string, string>>,
  context: GridFormulaContext,
): GridFormulaSetResult {
  const values: Record<string, number> = {};
  const formulas = new Map<string, string>();
  const nonNumericKeys = new Set<string>();
  for (const [key, content] of Object.entries(cellContents)) {
    if (content.startsWith('=')) formulas.set(key, content);
    else {
      const trimmed = content.trim();
      if (trimmed === '') continue;
      const value = Number(trimmed);
      if (Number.isFinite(value)) values[key] = value;
      else nonNumericKeys.add(key);
    }
  }

  const references = new Map<string, string[]>();
  const complexityInvalidKeys = new Set<string>();
  const nonNumericReferenceKeys = new Set<string>();
  const referenceBudget = TEMPLATE_COMPLEXITY_LIMITS.maxGridCellsPerElement * 4;
  let referenceCount = 0;
  for (const [key, formula] of formulas) {
    const visits = countFormulaReferenceVisits(formula, context, referenceBudget - referenceCount);
    if (visits === undefined) {
      references.set(key, []);
      complexityInvalidKeys.add(key);
      continue;
    }
    referenceCount += visits;
    const cellReferences = getFormulaReferences(formula, context);
    references.set(key, cellReferences);
    if (cellReferences.some(reference => nonNumericKeys.has(reference))) {
      nonNumericReferenceKeys.add(key);
    }
  }
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const key of formulas.keys()) indegree.set(key, 0);
  for (const [key, cellReferences] of references) {
    for (const reference of new Set(cellReferences)) {
      if (!formulas.has(reference)) continue;
      indegree.set(key, (indegree.get(key) ?? 0) + 1);
      const existing = dependents.get(reference);
      if (existing) existing.push(key);
      else dependents.set(reference, [key]);
    }
  }

  const queue = [...indegree].filter(([, count]) => count === 0).map(([key]) => key);
  const processed = new Set<string>();
  const invalidKeys = new Set<string>();
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const key = queue[queueIndex];
    const formula = formulas.get(key);
    if (!formula) continue;
    const result = complexityInvalidKeys.has(key) || nonNumericReferenceKeys.has(key)
      ? undefined
      : evaluateGridFormula(formula, values, { ...context, errorCellKeys: invalidKeys });
    if (result === undefined || !Number.isFinite(result)) invalidKeys.add(key);
    else values[key] = result;
    processed.add(key);
    for (const dependent of dependents.get(key) ?? []) {
      const nextCount = (indegree.get(dependent) ?? 1) - 1;
      indegree.set(dependent, nextCount);
      if (nextCount === 0) queue.push(dependent);
    }
  }

  const remaining = new Set([...formulas.keys()].filter(key => !processed.has(key)));
  const finishOrder: string[] = [];
  const visited = new Set<string>();
  for (const start of remaining) {
    if (visited.has(start)) continue;
    const stack: Array<[string, boolean]> = [[start, false]];
    while (stack.length > 0) {
      const [key, expanded] = stack.pop()!;
      if (expanded) {
        finishOrder.push(key);
        continue;
      }
      if (visited.has(key)) continue;
      visited.add(key);
      stack.push([key, true]);
      for (const reference of references.get(key) ?? []) {
        if (remaining.has(reference) && formulas.has(reference) && !visited.has(reference)) {
          stack.push([reference, false]);
        }
      }
    }
  }
  const cycleKeys = new Set<string>();
  const assigned = new Set<string>();
  for (let index = finishOrder.length - 1; index >= 0; index -= 1) {
    const start = finishOrder[index];
    if (assigned.has(start)) continue;
    const component: string[] = [];
    const stack = [start];
    assigned.add(start);
    while (stack.length > 0) {
      const key = stack.pop()!;
      component.push(key);
      for (const dependent of dependents.get(key) ?? []) {
        if (remaining.has(dependent) && !assigned.has(dependent)) {
          assigned.add(dependent);
          stack.push(dependent);
        }
      }
    }
    const selfCycle = component.length === 1
      && (references.get(component[0]) ?? []).includes(component[0]);
    if (component.length > 1 || selfCycle) component.forEach(key => cycleKeys.add(key));
  }
  remaining.forEach(key => { if (!cycleKeys.has(key)) invalidKeys.add(key); });

  return { values, invalidKeys, cycleKeys };
}
