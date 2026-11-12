import type { TableColumn, TableFooter, TableFooterBandItem } from '@/engine/renderTree/model.js';
import { collectCyclicTableColumnKeys, type TableProps } from '@/plugins/table/table.js';
import { getFormulaReferences, renameFormulaReferences } from '@/utils/calc.js';

const SUMMABLE_VALUE_TYPES = new Set<TableColumn['valueType']>([
  'number',
  'currency',
  'formula',
]);

function columnFormulaDependencies(column: TableColumn): string[] {
  if (column.valueType !== 'formula' || !column.formula) return [];
  try {
    return getFormulaReferences(column.formula.expression)
      .filter(reference => reference.startsWith('row.'))
      .map(reference => reference.slice('row.'.length));
  } catch {
    return [];
  }
}

export function canReferenceTableColumn(
  columns: TableColumn[],
  consumerKey: string,
  sourceKey: string,
): boolean {
  if (consumerKey === sourceKey) return false;
  const depsByKey = new Map(columns.map(column => [column.key, columnFormulaDependencies(column)]));
  const reachable = new Set<string>();
  const pending = [...(depsByKey.get(sourceKey) ?? [])];
  while (pending.length > 0) {
    const key = pending.pop()!;
    if (reachable.has(key)) continue;
    reachable.add(key);
    pending.push(...(depsByKey.get(key) ?? []));
  }
  return !reachable.has(consumerKey);
}

export function getFormulaSourceColumns(columns: TableColumn[], formulaIndex: number): TableColumn[] {
  const consumer = columns[formulaIndex];
  if (!consumer) return [];
  return columns.filter(column => canReferenceTableColumn(
    columns,
    consumer.key,
    column.key,
  ));
}

export function isValidTableColumnFormula(
  columns: TableColumn[],
  formulaIndex: number,
  expression: string,
): boolean {
  const candidate = columns.map((column, index) => index === formulaIndex
    ? { ...column, formula: { kind: 'expression' as const, expression } }
    : column);
  const keys = new Set(candidate.map(column => column.key));
  const deps = new Map<string, Set<string>>();
  for (const column of candidate) {
    if (column.valueType !== 'formula' || !column.formula) continue;
    const columnDeps = new Set<string>();
    try {
      for (const reference of getFormulaReferences(column.formula.expression)) {
        if (reference.startsWith('row.')) {
          const key = reference.slice('row.'.length);
          if (keys.has(key)) columnDeps.add(key);
          else return false;
        }
      }
    } catch {
      return false;
    }
    deps.set(column.key, columnDeps);
  }
  return collectCyclicTableColumnKeys(deps).size === 0;
}

export function moveTableColumn(columns: TableColumn[], fromIndex: number, toIndex: number): TableColumn[] {
  if (fromIndex < 0 || fromIndex >= columns.length || toIndex < 0 || toIndex >= columns.length) {
    return columns;
  }
  const next = columns.map(column => ({ ...column }));
  const [column] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, column);
  return next;
}

export function updateTableFooterOutputField(
  footer: TableFooter,
  outputFieldKey: string,
): TableFooter {
  const next = { ...footer };
  if (outputFieldKey.trim()) next.outputFieldKey = outputFieldKey;
  else delete next.outputFieldKey;
  return next;
}

export function updateTableFootersInProps(
  props: TableProps,
  nextFooters: TableFooter[],
): TableProps {
  const footers = reconcileTableFooters(nextFooters, props.columns);
  const nextProps: TableProps = { ...props, footers };
  if (!props.footerBand) {
    delete nextProps.footerBand;
    return nextProps;
  }
  nextProps.footerBand = {
    ...props.footerBand,
    items: syncTableFooterBandItems(props.footerBand.items, footers),
  };
  return nextProps;
}

export function tableFooterDependencyIds(footer: TableFooter): string[] {
  try {
    return getFormulaReferences(footer.formula.expression)
      .filter(reference => reference.startsWith('footer.'))
      .map(reference => reference.slice('footer.'.length));
  } catch {
    return [];
  }
}

export function tableFooterDependentIds(
  footers: TableFooter[],
  sourceFooterId: string,
): string[] {
  // A direct dependency can feed another total, so deletion impact must use the transitive closure.
  const affected = new Set([sourceFooterId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const footer of footers) {
      if (affected.has(footer.id)) continue;
      if (tableFooterDependencyIds(footer).some(id => affected.has(id))) {
        affected.add(footer.id);
        changed = true;
      }
    }
  }
  affected.delete(sourceFooterId);
  return footers.filter(footer => affected.has(footer.id)).map(footer => footer.id);
}

export function canReferenceTableFooter(
  footers: TableFooter[],
  consumerFooterId: string,
  sourceFooterId: string,
): boolean {
  return consumerFooterId !== sourceFooterId
    && !tableFooterDependentIds(footers, consumerFooterId).includes(sourceFooterId);
}

function reorderedFooters(
  footers: TableFooter[],
  fromIndex: number,
  toIndex: number,
): TableFooter[] | null {
  if (
    fromIndex < 0
    || fromIndex >= footers.length
    || toIndex < 0
    || toIndex >= footers.length
  ) {
    return null;
  }
  const next = [...footers];
  const [footer] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, footer);
  return next;
}

export function canMoveTableFooter(
  footers: TableFooter[],
  fromIndex: number,
  toIndex: number,
): boolean {
  return reorderedFooters(footers, fromIndex, toIndex) !== null;
}

export function moveTableFooter(
  footers: TableFooter[],
  fromIndex: number,
  toIndex: number,
): TableFooter[] {
  if (!canMoveTableFooter(footers, fromIndex, toIndex)) return footers;
  return reorderedFooters(footers, fromIndex, toIndex) ?? footers;
}

export function syncTableFooterBandItems(
  items: TableFooterBandItem[],
  footers: TableFooter[],
): TableFooterBandItem[] {
  const widths = new Map(items.map(item => [item.footerId, item.width]));
  // Band layout follows display order, while user-tuned widths survive moves and edits.
  return footers.map(footer => ({
    footerId: footer.id,
    width: widths.get(footer.id) ?? 2,
  }));
}

function fallbackFooterColumnKey(columns: TableColumn[]): string | null {
  return (
    columns.findLast(column => SUMMABLE_VALUE_TYPES.has(column.valueType)) ??
    columns.at(-1)
  )?.key ?? null;
}

function fallbackFooterFormula(columns: TableColumn[]): TableFooter['formula'] | null {
  const columnKey = fallbackFooterColumnKey(columns);

  if (!columnKey) {
    return null;
  }

  return {
    kind: 'expression',
    expression: `SUM(column.${columnKey})`,
  };
}

export function reconcileTableReferences(
  previousColumns: TableColumn[],
  nextColumns: TableColumn[],
  footers: TableFooter[],
): { columns: TableColumn[]; footers: TableFooter[] } {
  const previousKeyById = new Map(previousColumns.map(column => [column.id, column.key]));
  const nextKeyById = new Map(nextColumns.map(column => [column.id, column.key]));
  const renamedKeys = new Map<string, string>();
  for (const [id, previousKey] of previousKeyById) {
    const nextKey = nextKeyById.get(id);
    if (nextKey) renamedKeys.set(previousKey, nextKey);
  }

  const columns = nextColumns.map(column => {
    if (!column.formula) return { ...column };
    const replacements = new Map(
      [...renamedKeys].map(([previous, next]) => [`row.${previous}`, `row.${next}`]),
    );
    let expression = typeof column.formula.expression === 'string'
      ? renameFormulaReferences(column.formula.expression, replacements)
      : '0';
    try {
      const availableKeys = new Set(nextColumns.map(candidate => candidate.key));
      if (getFormulaReferences(expression).some(reference =>
        reference.startsWith('row.')
        && !availableKeys.has(reference.slice('row.'.length))
      )) {
        const index = nextColumns.findIndex(candidate => candidate.id === column.id);
        const fallback = getFormulaSourceColumns(nextColumns, index).at(-1);
        expression = fallback ? `row.${fallback.key}` : '0';
      }
    } catch {
      expression = '0';
    }
    return {
      ...column,
      formula: {
        kind: 'expression' as const,
        expression,
      },
    };
  });

  return {
    columns,
    footers: reconcileTableFooters(
      footers.map(footer => {
        const startColumnKey = footer.startColumnKey
          ? renamedKeys.get(footer.startColumnKey) ?? footer.startColumnKey
          : undefined;
        const valueColumnKey = footer.valueColumnKey
          ? renamedKeys.get(footer.valueColumnKey) ?? footer.valueColumnKey
          : undefined;
        const nextFooter = { ...footer };
        if (startColumnKey) nextFooter.startColumnKey = startColumnKey;
        else delete nextFooter.startColumnKey;
        if (valueColumnKey) nextFooter.valueColumnKey = valueColumnKey;
        else delete nextFooter.valueColumnKey;
        const replacements = new Map(
          [...renamedKeys].map(([previous, next]) => [`column.${previous}`, `column.${next}`]),
        );
        const expression = typeof footer.formula?.expression === 'string'
          ? renameFormulaReferences(footer.formula.expression, replacements)
          : fallbackFooterFormula(nextColumns)?.expression ?? '0';
        return {
          ...nextFooter,
          formula: {
            kind: 'expression' as const,
            expression,
          },
        };
      }),
      columns,
    ),
  };
}

export function reconcileTableFooters(
  footers: TableFooter[],
  columns: TableColumn[],
): TableFooter[] {
  const columnKeys = new Set(columns.map(column => column.key));
  const footerIds = new Set(footers.map(footer => footer.id));
  const seenFooterIds = new Set<string>();
  const reconciled: TableFooter[] = [];

  const getFallbackFormula = () => fallbackFooterFormula(columns);

  for (const footer of footers) {
    if (seenFooterIds.has(footer.id)) {
      continue;
    }

    let formula = { ...footer.formula };
    try {
      const references = getFormulaReferences(formula.expression);
      const invalid = references.some(reference => (
        reference.startsWith('column.')
          ? !columnKeys.has(reference.slice('column.'.length))
          : reference.startsWith('footer.')
            ? reference.slice('footer.'.length) === footer.id
              || !footerIds.has(reference.slice('footer.'.length))
            : false
      ));
      if (invalid) {
        const fallback = getFallbackFormula();
        if (!fallback) continue;
        formula = fallback;
      }
    } catch {
      const fallback = getFallbackFormula();
      if (!fallback) continue;
      formula = fallback;
    }

    let startColumnKey = footer.startColumnKey;
    let valueColumnKey = footer.valueColumnKey;
    if (columns.length > 1 && (startColumnKey || valueColumnKey)) {
      let startIndex = startColumnKey ? columns.findIndex(column => column.key === startColumnKey) : 0;
      let valueIndex = valueColumnKey
        ? columns.findIndex(column => column.key === valueColumnKey)
        : columns.length - 1;
      if (valueIndex <= 0) valueIndex = columns.length - 1;
      if (startIndex < 0 || startIndex >= valueIndex) startIndex = Math.max(0, valueIndex - 1);
      startColumnKey = columns[startIndex].key;
      valueColumnKey = columns[valueIndex].key;
    } else if (columns.length === 1 && (startColumnKey || valueColumnKey)) {
      startColumnKey = columns[0].key;
      valueColumnKey = columns[0].key;
    }

    const nextFooter: TableFooter = { ...footer, formula };
    if (startColumnKey) nextFooter.startColumnKey = startColumnKey;
    else delete nextFooter.startColumnKey;
    if (valueColumnKey) nextFooter.valueColumnKey = valueColumnKey;
    else delete nextFooter.valueColumnKey;
    reconciled.push(nextFooter);

    seenFooterIds.add(footer.id);
  }

  return reconciled;
}
