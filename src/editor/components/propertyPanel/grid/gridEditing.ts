import type { IdGenerator } from '@/engine/core/document.js';
import type { GridCell, GridColumn, GridRow } from '@/engine/renderTree/model.js';
import {
  gridColumnIndexToLabel,
  rewriteGridFormulaReferences,
} from '@/plugins/grid/formula.js';
import { TEMPLATE_COMPLEXITY_LIMITS } from '@/engine/utils/limits.js';

export interface GridData {
  columns: GridColumn[];
  rows: GridRow[];
  cells: Record<string, GridCell>;
}

export interface GridVisualRange {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

interface ParsedCellKey {
  rowIndex: number;
  columnKey: string;
}

function parseCellKey(key: string): ParsedCellKey | undefined {
  const separator = key.indexOf(':');
  if (separator < 1) return undefined;
  const rawRow = key.slice(0, separator);
  if (!/^(0|[1-9]\d*)$/.test(rawRow)) return undefined;
  const rowIndex = Number(rawRow);
  const columnKey = key.slice(separator + 1);
  if (!Number.isSafeInteger(rowIndex) || rowIndex < 0 || !columnKey) return undefined;
  return { rowIndex, columnKey };
}

function assertGridCellKeys(data: GridData): void {
  const columnKeys = new Set(data.columns.map(column => column.key));
  for (const key of Object.keys(data.cells)) {
    const parsed = parseCellKey(key);
    if (!parsed || parsed.rowIndex >= data.rows.length || !columnKeys.has(parsed.columnKey)) {
      throw new Error(`Invalid grid cell key ${key}.`);
    }
  }
}

export function cloneGridCell(cell: GridCell | undefined): GridCell {
  if (!cell) return { content: '', role: 'body', align: 'left' };
  const clone = Object.fromEntries(
    Object.entries(cell).filter(([, value]) => value !== undefined),
  ) as unknown as GridCell;
  if (cell.borders) {
    clone.borders = Object.fromEntries(
      Object.entries(cell.borders).filter(([, value]) => value !== undefined),
    );
  }
  return clone;
}

function withSpan(cell: GridCell, columnSpan: number, rowSpan: number): GridCell {
  const next = cloneGridCell(cell);
  if (columnSpan === 1) delete next.columnSpan;
  else next.columnSpan = columnSpan;
  if (rowSpan === 1) delete next.rowSpan;
  else next.rowSpan = rowSpan;
  return next;
}

function defaultCell(rowIndex: number): GridCell {
  return {
    content: '',
    role: rowIndex === 0 ? 'header' : 'body',
    align: 'left',
  };
}

export function getNextGridColumnKey(columns: readonly GridColumn[]): string {
  const existing = new Set(columns.map(column => column.key));
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = gridColumnIndexToLabel(index);
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error('Unable to allocate a grid column key.');
}

export function buildGridCoverage(data: GridData): Map<string, string> {
  const coverage = new Map<string, string>();
  const columnIndexes = new Map(data.columns.map((column, index) => [column.key, index]));
  let coverageVisits = 0;
  for (const [anchorKey, cell] of Object.entries(data.cells)) {
    const parsed = parseCellKey(anchorKey);
    const columnIndex = parsed ? columnIndexes.get(parsed.columnKey) : undefined;
    if (!parsed || columnIndex === undefined || parsed.rowIndex >= data.rows.length) continue;
    const rowSpan = Math.min(cell.rowSpan ?? 1, data.rows.length - parsed.rowIndex);
    const columnSpan = Math.min(cell.columnSpan ?? 1, data.columns.length - columnIndex);
    for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
        coverageVisits += 1;
        if (coverageVisits > TEMPLATE_COMPLEXITY_LIMITS.maxGridCellsPerElement) {
          throw new Error('Grid merged coverage exceeds the complexity limit.');
        }
        const rowIndex = parsed.rowIndex + rowOffset;
        const coveredColumn = data.columns[columnIndex + columnOffset];
        const slot = `${rowIndex}:${coveredColumn.key}`;
        const previous = coverage.get(slot);
        if (previous && previous !== anchorKey) {
          throw new Error(`Grid cells ${previous} and ${anchorKey} overlap at ${slot}.`);
        }
        coverage.set(slot, anchorKey);
      }
    }
  }
  return coverage;
}

function fillUncoveredCells(data: GridData): GridData {
  if (data.rows.length * data.columns.length > TEMPLATE_COMPLEXITY_LIMITS.maxGridCellsPerElement) {
    throw new Error('Grid structure change exceeds the cell limit.');
  }
  const cells = Object.fromEntries(Object.entries(data.cells).map(([key, cell]) => [key, cloneGridCell(cell)]));
  const coverage = buildGridCoverage({ ...data, cells });
  for (let rowIndex = 0; rowIndex < data.rows.length; rowIndex += 1) {
    for (const column of data.columns) {
      const key = `${rowIndex}:${column.key}`;
      if (!coverage.has(key)) cells[key] = defaultCell(rowIndex);
    }
  }
  return { columns: data.columns, rows: data.rows, cells };
}

function normalizeRange(data: GridData, range: GridVisualRange): GridVisualRange {
  const normalized = {
    startRow: Math.min(range.startRow, range.endRow),
    endRow: Math.max(range.startRow, range.endRow),
    startColumn: Math.min(range.startColumn, range.endColumn),
    endColumn: Math.max(range.startColumn, range.endColumn),
  };
  if (
    normalized.startRow < 0
    || normalized.startColumn < 0
    || normalized.endRow >= data.rows.length
    || normalized.endColumn >= data.columns.length
  ) {
    throw new Error('Grid selection is outside the available rows or columns.');
  }
  return normalized;
}

export function mergeGridCells(
  data: GridData,
  range: GridVisualRange,
  clearConflicts = false,
): GridData {
  assertGridCellKeys(data);
  const selection = normalizeRange(data, range);
  const coverage = buildGridCoverage(data);
  const columnIndexes = new Map(data.columns.map((column, index) => [column.key, index]));
  const selectedAnchors = new Set<string>();
  for (let rowIndex = selection.startRow; rowIndex <= selection.endRow; rowIndex += 1) {
    for (let columnIndex = selection.startColumn; columnIndex <= selection.endColumn; columnIndex += 1) {
      const column = data.columns[columnIndex];
      const anchorKey = coverage.get(`${rowIndex}:${column.key}`);
      if (anchorKey) selectedAnchors.add(anchorKey);
    }
  }
  for (const anchorKey of selectedAnchors) {
    const parsed = parseCellKey(anchorKey);
    const cell = data.cells[anchorKey];
    const columnIndex = parsed ? columnIndexes.get(parsed.columnKey) : undefined;
    if (!parsed || !cell || columnIndex === undefined) continue;
    if (
      parsed.rowIndex < selection.startRow
      || parsed.rowIndex + (cell.rowSpan ?? 1) - 1 > selection.endRow
      || columnIndex < selection.startColumn
      || columnIndex + (cell.columnSpan ?? 1) - 1 > selection.endColumn
    ) {
      throw new Error(`Grid selection partially intersects merged cell ${anchorKey}.`);
    }
  }
  const anchorColumn = data.columns[selection.startColumn];
  const nextAnchorKey = `${selection.startRow}:${anchorColumn.key}`;
  const nextAnchor = cloneGridCell(data.cells[coverage.get(nextAnchorKey) ?? nextAnchorKey]);
  const conflicts = [...selectedAnchors].filter(key => key !== nextAnchorKey && data.cells[key]?.content.trim());
  if (conflicts.length > 0 && !clearConflicts) {
    throw new Error(`Grid merge would clear non-empty cells: ${conflicts.join(', ')}.`);
  }
  const cells = Object.fromEntries(Object.entries(data.cells).map(([key, cell]) => [key, cloneGridCell(cell)]));
  selectedAnchors.forEach(key => { delete cells[key]; });
  cells[nextAnchorKey] = withSpan(
    nextAnchor,
    selection.endColumn - selection.startColumn + 1,
    selection.endRow - selection.startRow + 1,
  );
  return { columns: data.columns, rows: data.rows, cells };
}

export function splitGridCell(data: GridData, anchorKey: string): GridData {
  assertGridCellKeys(data);
  const cell = data.cells[anchorKey];
  if (!cell || ((cell.columnSpan ?? 1) === 1 && (cell.rowSpan ?? 1) === 1)) return data;
  const cells = {
    ...data.cells,
    [anchorKey]: withSpan(cell, 1, 1),
  };
  return fillUncoveredCells({ columns: data.columns, rows: data.rows, cells });
}

function rebaseFormulaContents(
  cells: Record<string, GridCell>,
  previousRows: readonly GridRow[],
  previousColumns: readonly GridColumn[],
  nextRows: readonly GridRow[],
  nextColumns: readonly GridColumn[],
): Record<string, GridCell> {
  const nextRowIndexes = new Map(nextRows.map((row, index) => [row.id, index]));
  const nextColumnIndexes = new Map(nextColumns.map((column, index) => [column.id, index]));
  return Object.fromEntries(Object.entries(cells).map(([key, cell]) => [
    key,
    {
      ...cloneGridCell(cell),
      content: rewriteGridFormulaReferences(cell.content, coordinate => {
        const row = previousRows[coordinate.rowIndex];
        const column = previousColumns[coordinate.columnIndex];
        if (!row || !column) return undefined;
        const rowIndex = nextRowIndexes.get(row.id);
        const columnIndex = nextColumnIndexes.get(column.id);
        return rowIndex === undefined || columnIndex === undefined
          ? undefined
          : { rowIndex, columnIndex };
      }),
    },
  ]));
}

function finalizeStructureChange(
  previous: GridData,
  next: GridData,
): GridData {
  const cells = rebaseFormulaContents(
    next.cells,
    previous.rows,
    previous.columns,
    next.rows,
    next.columns,
  );
  return fillUncoveredCells({ ...next, cells });
}

export function insertGridRow(
  data: GridData,
  index: number,
  idGenerator: IdGenerator,
): GridData {
  assertGridCellKeys(data);
  if (data.rows.length >= TEMPLATE_COMPLEXITY_LIMITS.maxGridRowsPerElement) {
    throw new Error('Grid row limit reached.');
  }
  if ((data.rows.length + 1) * data.columns.length > TEMPLATE_COMPLEXITY_LIMITS.maxGridCellsPerElement) {
    throw new Error('Grid cell limit reached.');
  }
  const insertionIndex = Math.max(0, Math.min(Math.trunc(index), data.rows.length));
  const rows = [
    ...data.rows.slice(0, insertionIndex),
    { id: idGenerator('row') },
    ...data.rows.slice(insertionIndex),
  ];
  const cells: Record<string, GridCell> = {};
  for (const [key, cell] of Object.entries(data.cells)) {
    const parsed = parseCellKey(key);
    if (!parsed) continue;
    const rowSpan = cell.rowSpan ?? 1;
    const crossesInsertion = parsed.rowIndex < insertionIndex
      && parsed.rowIndex + rowSpan > insertionIndex;
    const rowIndex = parsed.rowIndex >= insertionIndex
      ? parsed.rowIndex + 1
      : parsed.rowIndex;
    cells[`${rowIndex}:${parsed.columnKey}`] = withSpan(
      cell,
      cell.columnSpan ?? 1,
      rowSpan + (crossesInsertion ? 1 : 0),
    );
  }
  return finalizeStructureChange(data, { columns: data.columns, rows, cells });
}

export function addGridRow(data: GridData, idGenerator: IdGenerator): GridData {
  return insertGridRow(data, data.rows.length, idGenerator);
}

export function deleteGridRow(data: GridData, index: number): GridData {
  assertGridCellKeys(data);
  if (data.rows.length <= 1 || index < 0 || index >= data.rows.length) return data;
  const rows = data.rows.filter((_, current) => current !== index);
  const cells: Record<string, GridCell> = {};
  for (const [key, cell] of Object.entries(data.cells)) {
    const parsed = parseCellKey(key);
    if (!parsed) continue;
    const rowSpan = cell.rowSpan ?? 1;
    const intersects = parsed.rowIndex <= index && index < parsed.rowIndex + rowSpan;
    if (intersects && rowSpan === 1) continue;
    const rowIndex = parsed.rowIndex > index ? parsed.rowIndex - 1 : parsed.rowIndex;
    cells[`${rowIndex}:${parsed.columnKey}`] = withSpan(
      cell,
      cell.columnSpan ?? 1,
      rowSpan - (intersects ? 1 : 0),
    );
  }
  return finalizeStructureChange(data, { columns: data.columns, rows, cells });
}

export function insertGridColumn(
  data: GridData,
  index: number,
  idGenerator: IdGenerator,
): GridData {
  assertGridCellKeys(data);
  if (data.columns.length >= TEMPLATE_COMPLEXITY_LIMITS.maxGridColumnsPerElement) {
    throw new Error('Grid column limit reached.');
  }
  if ((data.columns.length + 1) * data.rows.length > TEMPLATE_COMPLEXITY_LIMITS.maxGridCellsPerElement) {
    throw new Error('Grid cell limit reached.');
  }
  const insertionIndex = Math.max(0, Math.min(Math.trunc(index), data.columns.length));
  const column: GridColumn = {
    id: idGenerator('col'),
    key: getNextGridColumnKey(data.columns),
    width: 1,
  };
  const columns = [
    ...data.columns.slice(0, insertionIndex),
    column,
    ...data.columns.slice(insertionIndex),
  ];
  const previousColumnIndexes = new Map(data.columns.map((item, current) => [item.key, current]));
  const cells: Record<string, GridCell> = {};
  for (const [key, cell] of Object.entries(data.cells)) {
    const parsed = parseCellKey(key);
    const columnIndex = parsed ? previousColumnIndexes.get(parsed.columnKey) : undefined;
    if (!parsed || columnIndex === undefined) continue;
    const columnSpan = cell.columnSpan ?? 1;
    const crossesInsertion = columnIndex < insertionIndex
      && columnIndex + columnSpan > insertionIndex;
    cells[key] = withSpan(
      cell,
      columnSpan + (crossesInsertion ? 1 : 0),
      cell.rowSpan ?? 1,
    );
  }
  return finalizeStructureChange(data, { columns, rows: data.rows, cells });
}

export function addGridColumn(data: GridData, idGenerator: IdGenerator): GridData {
  return insertGridColumn(data, data.columns.length, idGenerator);
}

export function expandGrid(
  data: GridData,
  targetRowCount: number,
  targetColumnCount: number,
  idGenerator: IdGenerator,
): GridData {
  assertGridCellKeys(data);
  const rowCount = Math.max(data.rows.length, Math.trunc(targetRowCount));
  const columnCount = Math.max(data.columns.length, Math.trunc(targetColumnCount));
  if (rowCount > TEMPLATE_COMPLEXITY_LIMITS.maxGridRowsPerElement) throw new Error('Grid row limit reached.');
  if (columnCount > TEMPLATE_COMPLEXITY_LIMITS.maxGridColumnsPerElement) throw new Error('Grid column limit reached.');
  if (rowCount * columnCount > TEMPLATE_COMPLEXITY_LIMITS.maxGridCellsPerElement) throw new Error('Grid cell limit reached.');

  const columns = data.columns.map(column => ({ ...column }));
  while (columns.length < columnCount) {
    columns.push({ id: idGenerator('col'), key: getNextGridColumnKey(columns), width: 1 });
  }
  const rows = data.rows.map(row => ({ ...row }));
  while (rows.length < rowCount) rows.push({ id: idGenerator('row') });
  const cells = Object.fromEntries(Object.entries(data.cells).map(([key, cell]) => [key, cloneGridCell(cell)]));
  return fillUncoveredCells({ columns, rows, cells });
}

function movedItems<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function areConsecutive(indexes: readonly number[]): boolean {
  const sorted = [...indexes].sort((left, right) => left - right);
  return sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
}

function remapCellsForOrder(
  data: GridData,
  rows: readonly GridRow[],
  columns: readonly GridColumn[],
): Record<string, GridCell> {
  const nextRowIndexes = new Map(rows.map((row, index) => [row.id, index]));
  const nextColumnIndexes = new Map(columns.map((column, index) => [column.id, index]));
  const previousColumnIndexes = new Map(data.columns.map((column, index) => [column.key, index]));
  const cells: Record<string, GridCell> = {};
  for (const [key, cell] of Object.entries(data.cells)) {
    const parsed = parseCellKey(key);
    const previousColumnIndex = parsed ? previousColumnIndexes.get(parsed.columnKey) : undefined;
    if (!parsed || previousColumnIndex === undefined) continue;
    const rowIds = data.rows
      .slice(parsed.rowIndex, parsed.rowIndex + (cell.rowSpan ?? 1))
      .map(row => row.id);
    const columnIds = data.columns
      .slice(previousColumnIndex, previousColumnIndex + (cell.columnSpan ?? 1))
      .map(column => column.id);
    const rowIndexes = rowIds.map(id => nextRowIndexes.get(id)).filter((index): index is number => index !== undefined);
    const columnIndexes = columnIds.map(id => nextColumnIndexes.get(id)).filter((index): index is number => index !== undefined);
    if (!areConsecutive(rowIndexes) || !areConsecutive(columnIndexes)) {
      throw new Error(`Grid move would split merged cell ${key}.`);
    }
    const rowIndex = Math.min(...rowIndexes);
    const columnIndex = Math.min(...columnIndexes);
    const nextColumn = columns[columnIndex];
    const nextKey = `${rowIndex}:${nextColumn.key}`;
    if (cells[nextKey]) throw new Error(`Grid move creates overlapping anchor ${nextKey}.`);
    cells[nextKey] = withSpan(cell, columnIndexes.length, rowIndexes.length);
  }
  return cells;
}

export function moveGridRow(data: GridData, fromIndex: number, toIndex: number): GridData {
  assertGridCellKeys(data);
  if (fromIndex === toIndex) return data;
  const rows = movedItems(data.rows, fromIndex, toIndex);
  const cells = remapCellsForOrder(data, rows, data.columns);
  return finalizeStructureChange(data, { columns: data.columns, rows, cells });
}

export function moveGridColumn(data: GridData, fromIndex: number, toIndex: number): GridData {
  assertGridCellKeys(data);
  if (fromIndex === toIndex) return data;
  const columns = movedItems(data.columns, fromIndex, toIndex);
  const cells = remapCellsForOrder(data, data.rows, columns);
  return finalizeStructureChange(data, { columns, rows: data.rows, cells });
}

export function deleteGridColumn(data: GridData, index: number): GridData {
  assertGridCellKeys(data);
  if (data.columns.length <= 1 || index < 0 || index >= data.columns.length) return data;
  const deleted = data.columns[index];
  const columns = data.columns.filter((_, current) => current !== index);
  const previousColumnIndexes = new Map(data.columns.map((column, current) => [column.key, current]));
  const cells: Record<string, GridCell> = {};
  for (const [key, cell] of Object.entries(data.cells)) {
    const parsed = parseCellKey(key);
    const columnIndex = parsed ? previousColumnIndexes.get(parsed.columnKey) : undefined;
    if (!parsed || columnIndex === undefined) continue;
    const columnSpan = cell.columnSpan ?? 1;
    const intersects = columnIndex <= index && index < columnIndex + columnSpan;
    if (intersects && columnSpan === 1) continue;
    const anchorColumn = columnIndex === index ? columns[index] : undefined;
    const columnKey = anchorColumn?.key ?? (parsed.columnKey === deleted.key ? undefined : parsed.columnKey);
    if (!columnKey) continue;
    cells[`${parsed.rowIndex}:${columnKey}`] = withSpan(
      cell,
      columnSpan - (intersects ? 1 : 0),
      cell.rowSpan ?? 1,
    );
  }
  return finalizeStructureChange(data, { columns, rows: data.rows, cells });
}
