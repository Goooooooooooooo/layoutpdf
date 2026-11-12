import type {
  ComputedTableFooter,
  TableColumn,
  TableFooter,
  TableFormulaEvaluationError,
  TableNode,
  TableValueRow,
} from '@/engine/renderTree/model.js';
import {
  FORMULA_ERROR,
} from '@/engine/renderTree/model.js';
import {
  evaluateFormula,
  evaluateFormulaNode,
  type FormulaScope,
  type FormulaValue,
} from '@/utils/calc.js';

function scalarFormulaValue(value: FormulaValue, context: string): number {
  if (typeof value !== 'number') throw new Error(`${context} requires a single numeric value.`);
  if (!Number.isFinite(value)) throw new Error(`${context} is not finite.`);
  return value;
}

function numericRowValue(value: unknown, key: string): number {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    throw new Error(`Table column "${key}" is not numeric.`);
  }
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value !== 'string') throw new Error(`Table column "${key}" is not numeric.`);
  if (value.trim() === '') return 0;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  throw new Error(`Table column "${key}" is not numeric.`);
}

function numericFormulaFields(fields: TableNode['formulaFields']): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
    else if (typeof value === 'string' && value.trim() === '') result[key] = 0;
    else if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) result[key] = parsed;
    }
  }
  return result;
}

function createRowScope(args: {
  row: TableValueRow;
  rowIndex: number;
  rows: readonly TableValueRow[];
  fields: Record<string, number>;
  resolveCurrentColumn: (key: string) => number | typeof FORMULA_ERROR;
}): FormulaScope {
  const scopeFor = (row: TableValueRow, rowIndex: number): FormulaScope => ({
    resolve(reference) {
      if (reference.startsWith('row.')) {
        const key = reference.slice('row.'.length);
        const resolved = rowIndex === args.rowIndex
          ? args.resolveCurrentColumn(key)
          : row[key];
        return resolved === FORMULA_ERROR ? FORMULA_ERROR : numericRowValue(resolved, key);
      }
      if (reference.startsWith('field.')) return args.fields[reference.slice('field.'.length)];
      if (reference.startsWith('output.')) return args.fields[reference];
      if (reference === 'rowNumber') return rowIndex + 1;
      return undefined;
    },
    call(name, functionArgs) {
      if (name === 'ROW_NUMBER') return rowIndex + 1;
      if (name !== 'RUNNING_SUM') return undefined;
      if (functionArgs.length !== 1) throw new Error('RUNNING_SUM requires one expression.');
      let total = 0;
      for (let index = 0; index <= rowIndex; index++) {
        const targetRow = index === args.rowIndex ? args.row : args.rows[index];
        total += scalarFormulaValue(
          evaluateFormulaNode(functionArgs[0], scopeFor(targetRow, index)),
          'RUNNING_SUM',
        );
      }
      return total;
    },
  });
  return scopeFor(args.row, args.rowIndex);
}

export function computeTableRowsResult(
  columns: TableColumn[],
  rows: TableValueRow[],
  formulaFields: TableNode['formulaFields'] = {},
): { rows: TableValueRow[]; errors: TableFormulaEvaluationError[] } {
  const computedRows: TableValueRow[] = [];
  const errors: TableFormulaEvaluationError[] = [];
  const fields = numericFormulaFields(formulaFields);
  const formulaColumns = columns.filter(column => column.valueType === 'formula' && column.formula);
  const columnsByKey = new Map(columns.map(column => [column.key, column]));

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row: TableValueRow = { ...rows[rowIndex] };

    const values = new Map<string, number | typeof FORMULA_ERROR>();
    const resolving = new Set<string>();

    const resolveColumn = (key: string): number | typeof FORMULA_ERROR => {
      const cached = values.get(key);
      if (cached !== undefined) return cached;

      const column = columnsByKey.get(key);
      if (!column) return FORMULA_ERROR;
      if (column.valueType !== 'formula' || !column.formula) {
        return numericRowValue(row[key], key);
      }

      if (resolving.has(key)) return FORMULA_ERROR;
      resolving.add(key);
      let value: number | typeof FORMULA_ERROR;
      try {
        value = evaluateFormula(
          column.formula.expression,
          createRowScope({
            row,
            rowIndex,
            rows: computedRows,
            fields,
            resolveCurrentColumn: resolveColumn,
          }),
          column.decimalPlaces,
        );
      } catch (error) {
        if (isPendingFormulaReference(error)) throw error;
        value = FORMULA_ERROR;
        errors.push({
          kind: 'row',
          rowId: row.id,
          rowIndex,
          columnKey: key,
          message: error instanceof Error ? error.message : 'Formula evaluation failed.',
        });
      } finally {
        resolving.delete(key);
      }
      values.set(key, value);
      return value;
    };

    for (const column of formulaColumns) {
      row[column.key] = resolveColumn(column.key);
    }
    computedRows.push(row);
  }
  return { rows: computedRows, errors };
}

export function computeTableRows(
  columns: TableColumn[],
  rows: TableValueRow[],
  formulaFields: TableNode['formulaFields'] = {},
): TableValueRow[] {
  return computeTableRowsResult(columns, rows, formulaFields).rows;
}

function isPendingFormulaReference(error: unknown): boolean {
  return error instanceof Error
    && /^Unknown formula field: (?:output\.|field\.)/.test(error.message);
}

export interface TableFooterEvaluationResult {
  footers: ComputedTableFooter[];
  errors: TableFormulaEvaluationError[];
}

export function computeTableFootersResult(
  footers: TableFooter[],
  rows: TableValueRow[],
  formulaFields: TableNode['formulaFields'] = {},
): TableFooterEvaluationResult {
  const errors: TableFormulaEvaluationError[] = [];
  const values = new Map<string, number>();
  const errored = new Set<string>();
  const footersById = new Map(footers.map(footer => [footer.id, footer]));
  const resolving = new Set<string>();
  const fields = numericFormulaFields(formulaFields);
  const resolveValue = (footerId: string): number => {
    if (errored.has(footerId)) {
      throw new Error(`Footer formula depends on an errored total: ${footerId}.`);
    }
    const cached = values.get(footerId);
    if (cached !== undefined) return cached;
    const footer = footersById.get(footerId);
    if (!footer) throw new Error(`Unknown formula footer: ${footerId}.`);
    if (resolving.has(footerId)) throw new Error(`Circular footer formula: ${footerId}.`);
    resolving.add(footerId);
    let value: number;
    try {
      value = evaluateFormula(footer.formula.expression, {
        resolve(reference) {
          if (reference.startsWith('column.')) {
            const key = reference.slice('column.'.length);
            return rows.map(row => {
              const raw = row[key];
              return raw === FORMULA_ERROR ? FORMULA_ERROR : numericRowValue(raw, key);
            }) as unknown as FormulaValue;
          }
          if (reference.startsWith('footer.')) {
            return resolveValue(reference.slice('footer.'.length));
          }
          if (reference.startsWith('field.')) {
            return fields[reference.slice('field.'.length)];
          }
          if (reference.startsWith('output.')) return fields[reference];
          return undefined;
        },
      });
    } catch (error) {
      if (isPendingFormulaReference(error)) throw error;
      errored.add(footerId);
      if (!errors.some(entry => entry.kind === 'footer' && entry.footerId === footerId)) {
        errors.push({
          kind: 'footer',
          footerId,
          message: error instanceof Error ? error.message : 'Footer formula evaluation failed.',
        });
      }
      throw error;
    } finally {
      resolving.delete(footerId);
    }
    values.set(footer.id, value);
    return value;
  };
  const computedFooters: ComputedTableFooter[] = [];
  for (const footer of footers) {
    try {
      const value = resolveValue(footer.id);
      computedFooters.push({
        id: footer.id,
        label: footer.label,
        value,
        bold: footer.bold ?? false,
        ...(footer.fontSize === undefined ? {} : { fontSize: footer.fontSize }),
        ...(footer.startColumnKey === undefined ? {} : { startColumnKey: footer.startColumnKey }),
        ...(footer.valueColumnKey === undefined ? {} : { valueColumnKey: footer.valueColumnKey }),
        ...(footer.outputFieldKey === undefined ? {} : { outputFieldKey: footer.outputFieldKey }),
        ...(footer.numericFormat === undefined ? {} : { numericFormat: { ...footer.numericFormat } }),
      });
    } catch (error) {
      if (isPendingFormulaReference(error)) throw error;
      // Footer is recorded in errors; it is excluded from computedFooters and outputs.
    }
  }
  return { footers: computedFooters, errors };
}

export function computeTableFooters(
  footers: TableFooter[],
  rows: TableValueRow[],
  formulaFields: TableNode['formulaFields'] = {},
): ComputedTableFooter[] {
  return computeTableFootersResult(footers, rows, formulaFields).footers;
}

function cloneColumn(column: TableColumn): TableColumn {
  if (!column.formula) return {
    ...column,
    numericFormat: column.numericFormat ? { ...column.numericFormat } : undefined,
  };
  return {
    ...column,
    formula: { ...column.formula },
    numericFormat: column.numericFormat ? { ...column.numericFormat } : undefined,
  };
}

function cloneFooter(footer: TableFooter): TableFooter {
  return {
    ...footer,
    numericFormat: footer.numericFormat ? { ...footer.numericFormat } : undefined,
    formula: { ...footer.formula },
  };
}

export function computeTableNode(node: TableNode): TableNode {
  const rowResult = computeTableRowsResult(node.columns, node.rows, node.formulaFields);
  const computedRows = rowResult.rows;
  const footerResult = computeTableFootersResult(node.footers, computedRows, node.formulaFields);
  const computedFooters = footerResult.footers;
  const formulaErrors = [...rowResult.errors, ...footerResult.errors];
  return {
    ...node,
    formulaFields: node.formulaFields ? { ...node.formulaFields } : undefined,
    columns: node.columns.map(cloneColumn),
    rows: node.rows.map(row => ({ ...row })),
    computedRows,
    formulaErrors,
    footers: node.footers.map(cloneFooter),
    footerBand: node.footerBand ? {
      ...node.footerBand,
      items: node.footerBand.items.map(item => ({ ...item })),
    } : undefined,
    computedFooters,
    outputs: computedFooters.map(footer => ({
      id: footer.id,
      kind: 'number' as const,
      label: footer.label,
      value: footer.value,
      ...(footer.numericFormat ? { numericFormat: { ...footer.numericFormat } } : {}),
    })),
    style: { ...node.style, border: { ...node.style.border } },
    input: node.input ? {
      ...node.input,
      ...(node.input.options ? {
        options: node.input.options.map(option => ({ ...option })),
      } : {}),
    } : undefined,
  };
}
