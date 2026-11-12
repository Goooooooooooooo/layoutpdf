import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import type { GridCell } from '@/engine/renderTree/model.js';
import { GridPropsSchema, type GridProps } from '@/plugins/grid/grid.js';
import {
  evaluateGridFormulaCells,
  getFormulaReferences,
  gridColumnIndexToLabel,
} from '@/plugins/grid/formula.js';
import Button from '@/ui/button/Button.js';
import IconButton from '@/ui/button/IconButton.js';
import Icon from '@/ui/icon/Icon.js';
import Input, { NumberInput, TextInput } from '@/ui/input/Input.js';
import Select from '@/ui/select/Select.js';
import { t } from '@/i18n/index.js';
import { Dialog } from '@/ui/dialog/Dialog.js';
import { ContextMenu, type ContextMenuItem } from '@/ui/contextMenu/ContextMenu.js';
import { createId } from '@/engine/core/document.js';
import {
  buildGridCoverage,
  cloneGridCell,
  deleteGridColumn,
  deleteGridRow,
  insertGridColumn,
  insertGridRow,
  expandGrid,
  mergeGridCells,
  moveGridColumn,
  moveGridRow,
  splitGridCell,
} from './gridEditing.js';
import { parseGridTsv, pasteGridTsv, serializeGridRange } from './gridClipboard.js';

const CELL_WIDTH = 112;
const CELL_HEIGHT = 36;
const ROW_HEADER_WIDTH = 48;
const COLUMN_HEADER_HEIGHT = 32;
const OVERSCAN = 2;

interface Coordinate {
  row: number;
  column: number;
}

interface RowColumnMenuState {
  kind: 'row' | 'column';
  index: number;
  x: number;
  y: number;
  trigger: HTMLButtonElement;
}

interface PendingDelete {
  kind: 'row' | 'column';
  index: number;
  affectedFormulas: number;
}

interface PendingSpanChange {
  columnSpan: number;
  rowSpan: number;
  conflicts: string[];
}

interface PendingPaste {
  values: string[][];
  targetRows: number;
  targetColumns: number;
}

type GridSearchMode = 'nonEmpty' | 'formula' | 'error';

const GRID_FORMAT_FIELDS: Array<keyof GridCell> = [
  'bold', 'fontSize', 'align', 'verticalAlign', 'borders', 'backgroundColor', 'color',
];

interface GridEditorWorkspaceProps {
  name: string;
  props: GridProps;
  disabled: boolean;
  onChange(props: GridProps, historyGroup?: string): void;
  onEndHistoryGroup(historyGroup: string): void;
  onCancelHistoryGroup(historyGroup: string): void;
  onClose(): void;
}

function normalizedRange(anchor: Coordinate, focus: Coordinate) {
  return {
    startRow: Math.min(anchor.row, focus.row),
    endRow: Math.max(anchor.row, focus.row),
    startColumn: Math.min(anchor.column, focus.column),
    endColumn: Math.max(anchor.column, focus.column),
  };
}

function parseAnchor(key: string, props: GridProps): Coordinate | undefined {
  const separator = key.indexOf(':');
  const row = Number(key.slice(0, separator));
  const columnKey = key.slice(separator + 1);
  const column = props.columns.findIndex(item => item.key === columnKey);
  return Number.isInteger(row) && row >= 0 && column >= 0 ? { row, column } : undefined;
}

function commonValue<T>(values: readonly T[]): T | undefined {
  if (!values.length) return undefined;
  return values.every(value => Object.is(value, values[0])) ? values[0] : undefined;
}

function buildOffsets(sizes: readonly number[], initial: number): number[] {
  const offsets = [initial];
  for (const size of sizes) offsets.push(offsets[offsets.length - 1] + size);
  return offsets;
}

function visibleIndex(offsets: readonly number[], sizes: readonly number[], position: number): number {
  let low = 0;
  let high = sizes.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle] + sizes[middle] < position) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(0, Math.min(sizes.length - 1, low));
}

function focusOutsideGrid(grid: HTMLElement, backwards: boolean): boolean {
  const candidates = [...globalThis.document.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter(element => {
    const style = globalThis.getComputedStyle(element);
    return (element === grid || !grid.contains(element))
      && element.getClientRects().length > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && element.getAttribute('aria-hidden') !== 'true';
  });
  const currentIndex = candidates.indexOf(grid);
  const target = candidates[currentIndex + (backwards ? -1 : 1)];
  if (!target) return false;
  target.focus();
  return true;
}

export default function GridEditorWorkspace({
  name,
  props,
  disabled,
  onChange,
  onEndHistoryGroup,
  onCancelHistoryGroup,
  onClose,
}: GridEditorWorkspaceProps) {
  const [anchor, setAnchor] = useState<Coordinate>({ row: 0, column: 0 });
  const [focus, setFocus] = useState<Coordinate>({ row: 0, column: 0 });
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [confirmMergeCells, setConfirmMergeCells] = useState<string[]>([]);
  const [rowColumnMenu, setRowColumnMenu] = useState<RowColumnMenuState>();
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>();
  const [pendingSpanChange, setPendingSpanChange] = useState<PendingSpanChange>();
  const [pendingPaste, setPendingPaste] = useState<PendingPaste>();
  const [copiedFormat, setCopiedFormat] = useState<Partial<GridCell>>();
  const [pasting, setPasting] = useState(false);
  const [searchMode, setSearchMode] = useState<GridSearchMode>('nonEmpty');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCursor, setSearchCursor] = useState(-1);
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 800, height: 500 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeHistoryGroupRef = useRef<string | undefined>(undefined);
  const endHistoryGroupRef = useRef(onEndHistoryGroup);
  const formulaDraftAfterCancelRef = useRef<string | undefined>(undefined);
  const clipboardFallbackRef = useRef('');
  const resizeGestureRef = useRef<{
    kind: 'row' | 'column';
    index: number;
    startPosition: number;
    startValue: number;
    historyGroup: string;
  } | undefined>(undefined);
  const draggedHeaderRef = useRef<{ kind: 'row' | 'column'; index: number } | undefined>(undefined);
  endHistoryGroupRef.current = onEndHistoryGroup;
  const range = normalizedRange(anchor, focus);
  const columnKeys = useMemo(() => props.columns.map(column => column.key), [props.columns]);
  const validCellKeys = useMemo(() => new Set(props.rows.flatMap((_, rowIndex) =>
    props.columns.map(column => `${rowIndex}:${column.key}`)
  )), [props.columns, props.rows]);
  const formulaContext = useMemo(() => ({
    columnKeys,
    rowCount: props.rows.length,
    validCellKeys,
  }), [columnKeys, props.rows.length, validCellKeys]);
  const formulaResult = useMemo(() => evaluateGridFormulaCells(
    Object.fromEntries(Object.entries(props.cells).map(([key, cell]) => [key, cell.content])),
    formulaContext,
  ), [formulaContext, props.cells]);
  const formulaIssueKeys = useMemo(() => new Set([
    ...formulaResult.invalidKeys,
    ...formulaResult.cycleKeys,
  ]), [formulaResult]);
  const columnWidths = useMemo(() => props.columns.map(column =>
    Math.max(56, Math.min(448, CELL_WIDTH * column.width))
  ), [props.columns]);
  const rowHeights = useMemo(() => props.rows.map((row, index) => {
    const defaultHeight = index === 0 ? props.style.headerHeight : props.style.rowHeight;
    return Math.max(24, Math.min(180, CELL_HEIGHT * ((row.height ?? defaultHeight) / defaultHeight)));
  }), [props.rows, props.style.headerHeight, props.style.rowHeight]);
  const columnOffsets = useMemo(() => buildOffsets(columnWidths, ROW_HEADER_WIDTH), [columnWidths]);
  const rowOffsets = useMemo(() => buildOffsets(rowHeights, COLUMN_HEADER_HEIGHT), [rowHeights]);
  const coverage = useMemo(() => buildGridCoverage({
    columns: props.columns,
    rows: props.rows,
    cells: props.cells,
  }), [props.cells, props.columns, props.rows]);
  const activeColumn = props.columns[focus.column];
  const activeSlotKey = activeColumn ? `${focus.row}:${activeColumn.key}` : '';
  const activeKey = coverage.get(activeSlotKey) ?? activeSlotKey;
  const activeCell = props.cells[activeKey];
  const formulaReferences = useMemo(() => new Set(
    draft.startsWith('=') ? getFormulaReferences(draft, formulaContext) : [],
  ), [draft, formulaContext]);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return Object.entries(props.cells)
      .flatMap(([key, cell]) => {
        const coordinate = parseAnchor(key, props);
        if (!coordinate) return [];
        const isFormula = cell.content.startsWith('=');
        const matchesMode = searchMode === 'nonEmpty'
          ? cell.content.trim().length > 0
          : searchMode === 'formula'
            ? isFormula
            : isFormula && formulaIssueKeys.has(key);
        if (!matchesMode) return [];
        const address = `${gridColumnIndexToLabel(coordinate.column)}${coordinate.row + 1}`;
        if (query && !cell.content.toLocaleLowerCase().includes(query) && !address.includes(query)) return [];
        return [{ key, coordinate }];
      })
      .sort((left, right) => left.coordinate.row - right.coordinate.row || left.coordinate.column - right.coordinate.column);
  }, [formulaIssueKeys, props, searchMode, searchQuery]);

  useEffect(() => {
    if (formulaDraftAfterCancelRef.current !== undefined) {
      setDraft(formulaDraftAfterCancelRef.current);
      formulaDraftAfterCancelRef.current = undefined;
    } else {
      setDraft(activeCell?.content ?? '');
    }
    setError('');
  }, [activeCell?.content, activeKey]);

  useEffect(() => {
    setSearchCursor(current => Math.min(current, searchResults.length - 1));
  }, [searchResults.length]);

  useEffect(() => {
    const finish = () => setDragging(false);
    window.addEventListener('pointerup', finish);
    return () => window.removeEventListener('pointerup', finish);
  }, []);

  useEffect(() => () => {
    if (activeHistoryGroupRef.current) endHistoryGroupRef.current(activeHistoryGroupRef.current);
  }, []);

  useEffect(() => {
    const maxRow = props.rows.length - 1;
    const maxColumn = props.columns.length - 1;
    setAnchor(current => ({
      row: Math.min(current.row, maxRow),
      column: Math.min(current.column, maxColumn),
    }));
    setFocus(current => ({
      row: Math.min(current.row, maxRow),
      column: Math.min(current.column, maxColumn),
    }));
  }, [props.columns.length, props.rows.length]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewport(current => ({ ...current, width: rect.width, height: rect.height }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const left = columnOffsets[focus.column];
    const right = columnOffsets[focus.column + 1];
    const top = rowOffsets[focus.row];
    const bottom = rowOffsets[focus.row + 1];
    if (left < node.scrollLeft + ROW_HEADER_WIDTH) node.scrollLeft = Math.max(0, left - ROW_HEADER_WIDTH);
    else if (right > node.scrollLeft + node.clientWidth) node.scrollLeft = right - node.clientWidth;
    if (top < node.scrollTop + COLUMN_HEADER_HEIGHT) node.scrollTop = Math.max(0, top - COLUMN_HEADER_HEIGHT);
    else if (bottom > node.scrollTop + node.clientHeight) node.scrollTop = bottom - node.clientHeight;
  }, [columnOffsets, focus.column, focus.row, rowOffsets]);

  const select = (coordinate: Coordinate, extend: boolean) => {
    const row = Math.max(0, Math.min(coordinate.row, props.rows.length - 1));
    const column = Math.max(0, Math.min(coordinate.column, props.columns.length - 1));
    const next = { row, column };
    if (!extend) setAnchor(next);
    setFocus(next);
  };

  const navigateSearch = (direction: -1 | 1) => {
    if (!searchResults.length) return;
    const nextCursor = searchCursor < 0
      ? (direction > 0 ? 0 : searchResults.length - 1)
      : (searchCursor + direction + searchResults.length) % searchResults.length;
    const result = searchResults[nextCursor];
    setSearchCursor(nextCursor);
    select(result.coordinate, false);
    viewportRef.current?.focus();
  };

  const updateProps = (next: Pick<GridProps, 'columns' | 'rows' | 'cells'>, historyGroup?: string) => {
    const candidate = { ...props, ...next };
    const validation = GridPropsSchema.safeParse(candidate);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      setError(t('property.grid.schemaInvalid', { path: issue?.path.join('.') || 'props' }));
      return false;
    }
    if (activeHistoryGroupRef.current && activeHistoryGroupRef.current !== historyGroup) {
      onEndHistoryGroup(activeHistoryGroupRef.current);
    }
    activeHistoryGroupRef.current = historyGroup;
    onChange(validation.data, historyGroup);
    return true;
  };

  const endContinuousEdit = (historyGroup: string) => {
    onEndHistoryGroup(historyGroup);
    if (activeHistoryGroupRef.current === historyGroup) activeHistoryGroupRef.current = undefined;
  };

  const cancelContinuousEdit = (historyGroup: string) => {
    onCancelHistoryGroup(historyGroup);
    if (activeHistoryGroupRef.current === historyGroup) activeHistoryGroupRef.current = undefined;
  };

  const selectedAnchorKeys = () => {
    const keys = new Set<string>();
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let column = range.startColumn; column <= range.endColumn; column += 1) {
        const item = props.columns[column];
        if (!item) continue;
        const slot = `${row}:${item.key}`;
        keys.add(coverage.get(slot) ?? slot);
      }
    }
    return [...keys];
  };

  const selectedKeys = selectedAnchorKeys();
  const selectedCells = selectedKeys.map(key => props.cells[key]).filter((cell): cell is GridCell => Boolean(cell));
  const selectedRole = commonValue(selectedCells.map(cell => cell.role));
  const selectedAlign = commonValue(selectedCells.map(cell => cell.align ?? 'left'));
  const selectedVerticalAlign = commonValue(selectedCells.map(cell => cell.verticalAlign ?? 'middle'));
  const selectedFontSize = commonValue(selectedCells.map(cell => cell.fontSize));
  const selectedBackgroundColor = commonValue(selectedCells.map(cell => cell.backgroundColor));
  const selectedTextColor = commonValue(selectedCells.map(cell => cell.color));

  const patchSelected = (patch: Partial<GridCell>, historyGroup?: string) => {
    const cells = { ...props.cells };
    for (const key of selectedAnchorKeys()) {
      const cell = cloneGridCell(cells[key]);
      for (const [field, value] of Object.entries(patch)) {
        if (value === undefined) delete cell[field as keyof GridCell];
        else Object.assign(cell, { [field]: value });
      }
      cells[key] = cell;
    }
    updateProps({ columns: props.columns, rows: props.rows, cells }, historyGroup);
  };

  const applyBorders = (mode: 'all' | 'outer' | 'inner' | 'innerHorizontal' | 'innerVertical' | 'top' | 'bottom' | 'left' | 'right' | 'clear') => {
    const cells = { ...props.cells };
    for (const key of selectedAnchorKeys()) {
      const cell = cloneGridCell(cells[key]);
      const coordinate = parseAnchor(key, props);
      if (!coordinate) continue;
      const lastRow = coordinate.row + (cell.rowSpan ?? 1) - 1;
      const lastColumn = coordinate.column + (cell.columnSpan ?? 1) - 1;
      const borders = { ...(cell.borders ?? {}) };
      if (mode === 'all' || mode === 'clear') {
        const value = mode === 'all';
        Object.assign(borders, { top: value, bottom: value, left: value, right: value });
      } else if (mode === 'outer') {
        if (coordinate.row === range.startRow) borders.top = true;
        if (lastRow === range.endRow) borders.bottom = true;
        if (coordinate.column === range.startColumn) borders.left = true;
        if (lastColumn === range.endColumn) borders.right = true;
      } else if (mode === 'inner' || mode === 'innerHorizontal' || mode === 'innerVertical') {
        if (mode !== 'innerVertical') {
          if (coordinate.row > range.startRow) borders.top = true;
          if (lastRow < range.endRow) borders.bottom = true;
        }
        if (mode !== 'innerHorizontal') {
          if (coordinate.column > range.startColumn) borders.left = true;
          if (lastColumn < range.endColumn) borders.right = true;
        }
      } else if (mode === 'top' && coordinate.row === range.startRow) borders.top = true;
      else if (mode === 'bottom' && lastRow === range.endRow) borders.bottom = true;
      else if (mode === 'left' && coordinate.column === range.startColumn) borders.left = true;
      else if (mode === 'right' && lastColumn === range.endColumn) borders.right = true;
      cells[key] = { ...cell, borders };
    }
    updateProps({ columns: props.columns, rows: props.rows, cells });
  };

  const clearSelected = (mode: 'content' | 'format' | 'all') => {
    const cells = { ...props.cells };
    for (const key of selectedAnchorKeys()) {
      const cell = cloneGridCell(cells[key]);
      if (mode !== 'format') cell.content = '';
      if (mode !== 'content') GRID_FORMAT_FIELDS.forEach(field => { delete cell[field]; });
      cells[key] = cell;
    }
    updateProps({ columns: props.columns, rows: props.rows, cells });
  };

  const affectedFormulaCount = (kind: PendingDelete['kind'], index: number) => Object.values(props.cells)
    .filter(cell => cell.content.startsWith('='))
    .filter(cell => getFormulaReferences(cell.content, formulaContext).some(reference => {
      const coordinate = parseAnchor(reference, props);
      return coordinate ? coordinate[kind] === index : false;
    })).length;

  const deleteStructure = (kind: PendingDelete['kind'], index: number) => {
    applyStructure(() => kind === 'row'
      ? deleteGridRow({ columns: props.columns, rows: props.rows, cells: props.cells }, index)
      : deleteGridColumn({ columns: props.columns, rows: props.rows, cells: props.cells }, index));
    setPendingDelete(undefined);
  };

  const requestDeleteStructure = (kind: PendingDelete['kind'], index: number) => {
    const affectedFormulas = affectedFormulaCount(kind, index);
    if (affectedFormulas > 0) {
      setPendingDelete({ kind, index, affectedFormulas });
      return;
    }
    deleteStructure(kind, index);
  };

  const displayCellAddress = (key: string) => {
    const coordinate = parseAnchor(key.replace(/[.,]$/, ''), props);
    return coordinate
      ? `${gridColumnIndexToLabel(coordinate.column).toUpperCase()}${coordinate.row + 1}`
      : key;
  };

  const operationErrorMessage = (caught: unknown) => {
    if (!(caught instanceof Error)) return t('property.grid.operationFailed');
    if (caught.message.includes('outside the available rows or columns')) {
      return t('property.grid.selectionOutside');
    }
    const partial = caught.message.match(/partially intersects merged cell ([^.]*)/);
    if (partial) return t('property.grid.partialMerge', { cell: displayCellAddress(partial[1]) });
    const overlap = caught.message.match(/Grid cells (\S+) and (\S+) overlap at (\S+)/);
    if (overlap) {
      return t('property.grid.overlap', {
        first: displayCellAddress(overlap[1]),
        second: displayCellAddress(overlap[2]),
        cell: displayCellAddress(overlap[3]),
      });
    }
    if (caught.message.includes('Unable to allocate a grid column key')) {
      return t('property.grid.columnLimit');
    }
    if (caught.message.includes('Grid row limit reached')) return t('property.grid.rowLimit');
    if (caught.message.includes('Grid column limit reached')) return t('property.grid.columnLimit');
    if (caught.message.includes('Grid cell limit reached')) return t('property.grid.cellLimit');
    const splitMove = caught.message.match(/move would split merged cell ([^.]*)/);
    if (splitMove) return t('property.grid.moveSplitMerge', { cell: displayCellAddress(splitMove[1]) });
    const moveOverlap = caught.message.match(/move creates overlapping anchor ([^.]*)/);
    if (moveOverlap) return t('property.grid.moveOverlap', { cell: displayCellAddress(moveOverlap[1]) });
    return t('property.grid.operationFailed');
  };

  const resizeActiveSpan = (
    columnSpan: number,
    rowSpan: number,
    clearConflicts = false,
    historyGroup?: string,
  ) => {
    const coordinate = parseAnchor(activeKey, props);
    if (!coordinate || !activeCell) return;
    const nextColumnSpan = Math.max(1, Math.min(columnSpan, props.columns.length - coordinate.column));
    const nextRowSpan = Math.max(1, Math.min(rowSpan, props.rows.length - coordinate.row));
    try {
      let next = splitGridCell({ columns: props.columns, rows: props.rows, cells: props.cells }, activeKey);
      if (nextColumnSpan > 1 || nextRowSpan > 1) {
        next = mergeGridCells(next, {
          startRow: coordinate.row,
          endRow: coordinate.row + nextRowSpan - 1,
          startColumn: coordinate.column,
          endColumn: coordinate.column + nextColumnSpan - 1,
        }, clearConflicts);
      }
      updateProps(next, historyGroup);
      setAnchor(coordinate);
      setFocus({
        row: coordinate.row + nextRowSpan - 1,
        column: coordinate.column + nextColumnSpan - 1,
      });
      setPendingSpanChange(undefined);
      setError('');
    } catch (caught) {
      if (!clearConflicts && caught instanceof Error && caught.message.includes('would clear non-empty cells')) {
        const conflicts = caught.message.match(/would clear non-empty cells: (.*)\./)?.[1]
          .split(', ')
          .map(displayCellAddress) ?? [];
        setPendingSpanChange({ columnSpan: nextColumnSpan, rowSpan: nextRowSpan, conflicts });
        return;
      }
      setError(operationErrorMessage(caught));
    }
  };

  const copySelection = async () => {
    const text = serializeGridRange({ columns: props.columns, rows: props.rows, cells: props.cells }, range);
    clipboardFallbackRef.current = text;
    try {
      await navigator.clipboard?.writeText(text);
      setError('');
    } catch {
      setError(t('property.grid.clipboardWriteFailed'));
    }
  };

  const applyPaste = (values: string[][], allowExpansion: boolean) => {
    setPasting(true);
    try {
      const targetRows = range.startRow + values.length;
      const targetColumns = range.startColumn + Math.max(0, ...values.map(row => row.length));
      let next = { columns: props.columns, rows: props.rows, cells: props.cells };
      if (targetRows > props.rows.length || targetColumns > props.columns.length) {
        if (!allowExpansion) {
          setPendingPaste({ values, targetRows, targetColumns });
          return;
        }
        next = expandGrid(next, targetRows, targetColumns, createId);
      }
      next = pasteGridTsv(next, { row: range.startRow, column: range.startColumn }, values);
      const nextColumnKeys = next.columns.map(column => column.key);
      const nextValidCellKeys = new Set(next.rows.flatMap((_, rowIndex) =>
        next.columns.map(column => `${rowIndex}:${column.key}`)
      ));
      const nextFormulaResult = evaluateGridFormulaCells(
        Object.fromEntries(Object.entries(next.cells).map(([key, cell]) => [key, cell.content])),
        { columnKeys: nextColumnKeys, rowCount: next.rows.length, validCellKeys: nextValidCellKeys },
      );
      const pastedKeys = new Set(values.flatMap((row, rowOffset) => row.map((_, columnOffset) =>
        `${range.startRow + rowOffset}:${next.columns[range.startColumn + columnOffset]?.key ?? ''}`
      )));
      const invalidKey = [...nextFormulaResult.invalidKeys]
        .find(key => pastedKeys.has(key) || !formulaIssueKeys.has(key));
      if (invalidKey) {
        setError(t('property.grid.pasteFormulaInvalid', { cell: displayCellAddress(invalidKey) }));
        return;
      }
      const cycleKey = [...nextFormulaResult.cycleKeys]
        .find(key => pastedKeys.has(key) || !formulaIssueKeys.has(key));
      if (cycleKey) {
        setError(t('property.grid.pasteFormulaCycle', { cell: displayCellAddress(cycleKey) }));
        return;
      }
      if (!updateProps(next)) return;
      setAnchor({ row: range.startRow, column: range.startColumn });
      setFocus({
        row: Math.min(next.rows.length - 1, range.startRow + values.length - 1),
        column: Math.min(next.columns.length - 1, range.startColumn + Math.max(0, ...values.map(row => row.length)) - 1),
      });
      setPendingPaste(undefined);
      setError('');
    } catch (caught) {
      if (caught instanceof Error && caught.message.includes('paste intersects merged cell')) {
        const key = caught.message.match(/merged cell (.*)\./)?.[1] ?? '';
        setError(t('property.grid.pasteMergedCell', { cell: displayCellAddress(key) }));
      } else {
        setError(operationErrorMessage(caught));
      }
    } finally {
      setPasting(false);
    }
  };

  const pasteSelection = async () => {
    let text = clipboardFallbackRef.current;
    try {
      text = await navigator.clipboard?.readText() || text;
    } catch {
      if (!text) {
        setError(t('property.grid.clipboardReadFailed'));
        return;
      }
    }
    if (!text) return;
    applyPaste(parseGridTsv(text), false);
  };

  const copyActiveFormat = () => {
    if (!activeCell) return;
    setCopiedFormat(Object.fromEntries(GRID_FORMAT_FIELDS.map(field => [
      field,
      field === 'borders' && activeCell.borders ? { ...activeCell.borders } : activeCell[field],
    ])) as Partial<GridCell>);
  };

  const equalizeColumns = () => {
    const columns = props.columns.map((column, index) =>
      index >= range.startColumn && index <= range.endColumn ? { ...column, width: 1 } : column
    );
    updateProps({ columns, rows: props.rows, cells: props.cells });
  };

  const equalizeRows = () => {
    const rows = props.rows.map((row, index) =>
      index >= range.startRow && index <= range.endRow
        ? { ...row, height: index === 0 ? props.style.headerHeight : props.style.rowHeight }
        : row
    );
    updateProps({ columns: props.columns, rows, cells: props.cells });
  };

  const closeRowColumnMenu = () => {
    const trigger = rowColumnMenu?.trigger;
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus();
      else viewportRef.current?.focus();
    });
    setRowColumnMenu(undefined);
  };

  const openRowColumnMenu = (
    kind: RowColumnMenuState['kind'],
    index: number,
    trigger: HTMLButtonElement,
    position?: { x: number; y: number },
  ) => {
    if (kind === 'row') {
      const alreadySelected = range.startRow <= index && index <= range.endRow
        && range.startColumn === 0 && range.endColumn === props.columns.length - 1;
      if (!alreadySelected) {
        setAnchor({ row: index, column: 0 });
        setFocus({ row: index, column: props.columns.length - 1 });
      }
    } else {
      const alreadySelected = range.startColumn <= index && index <= range.endColumn
        && range.startRow === 0 && range.endRow === props.rows.length - 1;
      if (!alreadySelected) {
        setAnchor({ row: 0, column: index });
        setFocus({ row: props.rows.length - 1, column: index });
      }
    }
    const rect = trigger.getBoundingClientRect();
    setRowColumnMenu({
      kind,
      index,
      x: position?.x ?? rect.left,
      y: position?.y ?? rect.bottom,
      trigger,
    });
  };

  const handleHeaderContextMenu = (
    event: MouseEvent<HTMLButtonElement>,
    kind: RowColumnMenuState['kind'],
    index: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    openRowColumnMenu(kind, index, event.currentTarget, { x: event.clientX, y: event.clientY });
  };

  const handleHeaderKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    kind: RowColumnMenuState['kind'],
    index: number,
  ) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    event.stopPropagation();
    openRowColumnMenu(kind, index, event.currentTarget);
  };

  const startHeaderResize = (
    event: PointerEvent<HTMLSpanElement>,
    kind: 'row' | 'column',
    index: number,
  ) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const identity = kind === 'column' ? props.columns[index]?.id : props.rows[index]?.id;
    resizeGestureRef.current = {
      kind,
      index,
      startPosition: kind === 'column' ? event.clientX : event.clientY,
      startValue: kind === 'column'
        ? props.columns[index]?.width ?? 1
        : props.rows[index]?.height ?? (index === 0 ? props.style.headerHeight : props.style.rowHeight),
      historyGroup: `grid:${kind}:${identity ?? index}:size`,
    };
  };

  const moveHeaderResize = (event: PointerEvent<HTMLSpanElement>) => {
    const gesture = resizeGestureRef.current;
    if (!gesture) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = (gesture.kind === 'column' ? event.clientX : event.clientY) - gesture.startPosition;
    if (gesture.kind === 'column') {
      const width = Math.max(0.1, Math.min(4, gesture.startValue + delta / CELL_WIDTH));
      const columns = props.columns.map((column, index) => index === gesture.index ? { ...column, width } : column);
      updateProps({ columns, rows: props.rows, cells: props.cells }, gesture.historyGroup);
    } else {
      const defaultHeight = gesture.index === 0 ? props.style.headerHeight : props.style.rowHeight;
      const height = Math.max(1, Math.min(50, gesture.startValue + delta * defaultHeight / CELL_HEIGHT));
      const rows = props.rows.map((row, index) => index === gesture.index ? { ...row, height } : row);
      updateProps({ columns: props.columns, rows, cells: props.cells }, gesture.historyGroup);
    }
  };

  const finishHeaderResize = (event: PointerEvent<HTMLSpanElement>) => {
    const gesture = resizeGestureRef.current;
    if (!gesture) return;
    event.preventDefault();
    event.stopPropagation();
    endContinuousEdit(gesture.historyGroup);
    resizeGestureRef.current = undefined;
  };

  const resizeHeaderByKeyboard = (
    event: KeyboardEvent<HTMLSpanElement>,
    kind: 'row' | 'column',
    index: number,
  ) => {
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!direction || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (kind === 'column') {
      const column = props.columns[index];
      if (!column) return;
      const group = `grid:column:${column.id}:size`;
      const columns = props.columns.map((item, current) => current === index
        ? { ...item, width: Math.max(0.1, Math.min(4, item.width + direction * 0.1)) }
        : item);
      updateProps({ columns, rows: props.rows, cells: props.cells }, group);
      endContinuousEdit(group);
    } else {
      const row = props.rows[index];
      if (!row) return;
      const group = `grid:row:${row.id}:size`;
      const currentHeight = row.height ?? (index === 0 ? props.style.headerHeight : props.style.rowHeight);
      const rows = props.rows.map((item, current) => current === index
        ? { ...item, height: Math.max(1, Math.min(50, currentHeight + direction * 0.5)) }
        : item);
      updateProps({ columns: props.columns, rows, cells: props.cells }, group);
      endContinuousEdit(group);
    }
  };

  const moveHeader = (kind: 'row' | 'column', fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    if (kind === 'row') {
      if (!applyStructure(() => moveGridRow({ columns: props.columns, rows: props.rows, cells: props.cells }, fromIndex, toIndex))) return;
      setAnchor({ row: toIndex, column: 0 });
      setFocus({ row: toIndex, column: props.columns.length - 1 });
    } else {
      if (!applyStructure(() => moveGridColumn({ columns: props.columns, rows: props.rows, cells: props.cells }, fromIndex, toIndex))) return;
      setAnchor({ row: 0, column: toIndex });
      setFocus({ row: props.rows.length - 1, column: toIndex });
    }
  };

  const startHeaderDrag = (event: DragEvent<HTMLButtonElement>, kind: 'row' | 'column', index: number) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    draggedHeaderRef.current = { kind, index };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${kind}:${index}`);
  };

  const dropHeader = (event: DragEvent<HTMLButtonElement>, kind: 'row' | 'column', index: number) => {
    const dragged = draggedHeaderRef.current;
    if (!dragged || dragged.kind !== kind) return;
    event.preventDefault();
    event.stopPropagation();
    moveHeader(kind, dragged.index, index);
    draggedHeaderRef.current = undefined;
  };

  const rowColumnMenuItems: ContextMenuItem[] = rowColumnMenu?.kind === 'row'
    ? [
        { id: 'row-before', label: t('property.grid.insertRowBefore'), disabled, onClick: () => applyStructure(() => insertGridRow({ columns: props.columns, rows: props.rows, cells: props.cells }, rowColumnMenu.index, createId)) },
        { id: 'row-after', label: t('property.grid.insertRowAfter'), disabled, onClick: () => applyStructure(() => insertGridRow({ columns: props.columns, rows: props.rows, cells: props.cells }, rowColumnMenu.index + 1, createId)) },
        { id: 'row-move-before', label: t('property.grid.moveRowPrevious'), disabled: disabled || rowColumnMenu.index === 0, onClick: () => moveHeader('row', rowColumnMenu.index, rowColumnMenu.index - 1) },
        { id: 'row-move-after', label: t('property.grid.moveRowNext'), disabled: disabled || rowColumnMenu.index === props.rows.length - 1, onClick: () => moveHeader('row', rowColumnMenu.index, rowColumnMenu.index + 1) },
        { id: 'row-divider', label: '', divider: true },
        { id: 'row-equalize', label: t('property.grid.equalRows'), disabled, onClick: equalizeRows },
        { id: 'row-delete', label: t('property.grid.deleteRow'), disabled: disabled || props.rows.length <= 1, danger: true, onClick: () => requestDeleteStructure('row', rowColumnMenu.index) },
      ]
    : rowColumnMenu?.kind === 'column'
      ? [
          { id: 'column-before', label: t('property.grid.insertColumnBefore'), disabled, onClick: () => applyStructure(() => insertGridColumn({ columns: props.columns, rows: props.rows, cells: props.cells }, rowColumnMenu.index, createId)) },
          { id: 'column-after', label: t('property.grid.insertColumnAfter'), disabled, onClick: () => applyStructure(() => insertGridColumn({ columns: props.columns, rows: props.rows, cells: props.cells }, rowColumnMenu.index + 1, createId)) },
          { id: 'column-move-before', label: t('property.grid.moveColumnPrevious'), disabled: disabled || rowColumnMenu.index === 0, onClick: () => moveHeader('column', rowColumnMenu.index, rowColumnMenu.index - 1) },
          { id: 'column-move-after', label: t('property.grid.moveColumnNext'), disabled: disabled || rowColumnMenu.index === props.columns.length - 1, onClick: () => moveHeader('column', rowColumnMenu.index, rowColumnMenu.index + 1) },
          { id: 'column-divider', label: '', divider: true },
          { id: 'column-equalize', label: t('property.grid.equalColumns'), disabled, onClick: equalizeColumns },
          { id: 'column-delete', label: t('property.grid.deleteColumn'), disabled: disabled || props.columns.length <= 1, danger: true, onClick: () => requestDeleteStructure('column', rowColumnMenu.index) },
        ]
      : [];

  const commitDraft = () => {
    if (!activeKey || !activeCell || draft === activeCell.content) return true;
    if (draft.startsWith('=')) {
      const cells = { ...props.cells, [activeKey]: { ...cloneGridCell(activeCell), content: draft } };
      const result = evaluateGridFormulaCells(
        Object.fromEntries(Object.entries(cells).map(([key, cell]) => [key, cell.content])),
        formulaContext,
      );
      if (result.cycleKeys.has(activeKey)) {
        setError(t('property.grid.formulaCycle'));
        return false;
      }
      if (result.invalidKeys.has(activeKey)) {
        setError(t('property.grid.formulaInvalid'));
        return false;
      }
      updateProps({ columns: props.columns, rows: props.rows, cells });
    } else {
      const cells = { ...props.cells, [activeKey]: { ...cloneGridCell(activeCell), content: draft } };
      updateProps({ columns: props.columns, rows: props.rows, cells });
    }
    setError('');
    return true;
  };

  const updateDraft = (nextDraft: string) => {
    setDraft(nextDraft);
    setError('');
    if (!activeKey || !activeCell) return;
    const historyGroup = `grid:cell:${activeKey}:content`;
    if (nextDraft.startsWith('=')) {
      if (activeHistoryGroupRef.current === historyGroup) {
        formulaDraftAfterCancelRef.current = nextDraft;
        cancelContinuousEdit(historyGroup);
      }
      return;
    }
    const cells = { ...props.cells, [activeKey]: { ...cloneGridCell(activeCell), content: nextDraft } };
    updateProps({ columns: props.columns, rows: props.rows, cells }, historyGroup);
  };

  const finishDraft = () => {
    if (!commitDraft()) return false;
    endContinuousEdit(`grid:cell:${activeKey}:content`);
    return true;
  };

  const applyStructure = (operation: () => Pick<GridProps, 'columns' | 'rows' | 'cells'>): boolean => {
    try {
      const next = operation();
      if (!updateProps(next)) return false;
      setAnchor({ row: Math.min(focus.row, next.rows.length - 1), column: Math.min(focus.column, next.columns.length - 1) });
      setFocus(current => ({
        row: Math.min(current.row, next.rows.length - 1),
        column: Math.min(current.column, next.columns.length - 1),
      }));
      setError('');
      return true;
    } catch (caught) {
      setError(operationErrorMessage(caught));
      return false;
    }
  };

  const mergeSelection = (clearConflicts = false) => {
    try {
      const next = mergeGridCells({ columns: props.columns, rows: props.rows, cells: props.cells }, range, clearConflicts);
      updateProps(next);
      setConfirmMergeCells([]);
      setError('');
    } catch (caught) {
      if (!clearConflicts && caught instanceof Error && caught.message.includes('would clear non-empty cells')) {
        const conflicts = caught.message.match(/would clear non-empty cells: (.*)\./)?.[1]
          .split(', ')
          .map(displayCellAddress) ?? [];
        setConfirmMergeCells(conflicts);
        return;
      }
      setError(operationErrorMessage(caught));
    }
  };

  const startRow = Math.max(0, visibleIndex(rowOffsets, rowHeights, viewport.top) - OVERSCAN);
  const endRow = Math.min(props.rows.length - 1, visibleIndex(rowOffsets, rowHeights, viewport.top + viewport.height) + OVERSCAN);
  const startColumn = Math.max(0, visibleIndex(columnOffsets, columnWidths, viewport.left) - OVERSCAN);
  const endColumn = Math.min(props.columns.length - 1, visibleIndex(columnOffsets, columnWidths, viewport.left + viewport.width) + OVERSCAN);
  const visibleAnchors = new Set<string>();
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const item = props.columns[column];
      if (!item) continue;
      const key = `${row}:${item.key}`;
      visibleAnchors.add(coverage.get(key) ?? key);
    }
  }
  const accessibleRows = new Set(Array.from(
    { length: endRow - startRow + 1 },
    (_, offset) => startRow + offset,
  ));
  visibleAnchors.forEach(key => {
    const coordinate = parseAnchor(key, props);
    if (coordinate) accessibleRows.add(coordinate.row);
  });

  return (
    <section className="layoutpdf-grid-workspace" aria-label={t('property.grid.workspace')}>
      <header className="layoutpdf-grid-workspace-header">
        <IconButton title={t('property.grid.backToCanvas')} aria-label={t('property.grid.backToCanvas')} onClick={onClose}>
          <Icon name="arrow-left" />
        </IconButton>
        <strong>{name}</strong>
        <label className="layoutpdf-grid-formula-bar">
          <span>{gridColumnIndexToLabel(focus.column).toUpperCase()}{focus.row + 1}</span>
          <TextInput
            ref={inputRef}
            value={draft}
            disabled={disabled}
            placeholder={t('property.grid.contentPlaceholder')}
            aria-invalid={error ? true : undefined}
            onValueChange={updateDraft}
            onBlur={finishDraft}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                if (finishDraft()) viewportRef.current?.focus();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                cancelContinuousEdit(`grid:cell:${activeKey}:content`);
                setDraft(activeCell?.content ?? '');
                setError('');
                viewportRef.current?.focus();
              }
            }}
          />
        </label>
        <Button size="compact" disabled={disabled} onClick={finishDraft}>{t('common.confirm')}</Button>
      </header>

      <div className="layoutpdf-grid-command-bar">
        <div className="layoutpdf-grid-search-controls" role="search" aria-label={t('property.grid.search')}>
          <Select
            aria-label={t('property.grid.searchScope')}
            value={searchMode}
            onChange={value => {
              setSearchMode(value as GridSearchMode);
              setSearchCursor(-1);
            }}
            options={[
              { value: 'nonEmpty', label: t('property.grid.searchNonEmpty') },
              { value: 'formula', label: t('property.grid.searchFormula') },
              { value: 'error', label: t('property.grid.searchError') },
            ]}
          />
          <TextInput
            className="layoutpdf-grid-search-input"
            value={searchQuery}
            aria-label={t('property.grid.searchQuery')}
            placeholder={t('property.grid.searchPlaceholder')}
            onValueChange={value => {
              setSearchQuery(value);
              setSearchCursor(-1);
            }}
            onKeyDown={event => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              navigateSearch(event.shiftKey ? -1 : 1);
            }}
          />
          <span className="layoutpdf-grid-search-count" aria-live="polite">
            {searchResults.length ? `${Math.max(0, searchCursor) + 1}/${searchResults.length}` : t('property.grid.searchNoResults')}
          </span>
          <Button size="compact" disabled={!searchResults.length} onClick={() => navigateSearch(-1)}>{t('property.grid.searchPrevious')}</Button>
          <Button size="compact" disabled={!searchResults.length} onClick={() => navigateSearch(1)}>{t('property.grid.searchNext')}</Button>
        </div>
        <Button size="compact" disabled={disabled} onClick={() => applyStructure(() => insertGridRow({ columns: props.columns, rows: props.rows, cells: props.cells }, focus.row + 1, createId))}>{t('property.grid.addRow')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => applyStructure(() => insertGridColumn({ columns: props.columns, rows: props.rows, cells: props.cells }, focus.column + 1, createId))}>{t('property.grid.addColumn')}</Button>
        <Button size="compact" disabled={disabled || props.rows.length <= 1} onClick={() => requestDeleteStructure('row', focus.row)}>{t('property.grid.deleteRow')}</Button>
        <Button size="compact" disabled={disabled || props.columns.length <= 1} onClick={() => requestDeleteStructure('column', focus.column)}>{t('property.grid.deleteColumn')}</Button>
        <Button size="compact" disabled={disabled || (range.startRow === range.endRow && range.startColumn === range.endColumn)} onClick={() => mergeSelection()}>{t('property.grid.merge')}</Button>
        <Button size="compact" disabled={disabled || !activeCell || ((activeCell.columnSpan ?? 1) === 1 && (activeCell.rowSpan ?? 1) === 1)} onClick={() => applyStructure(() => splitGridCell({ columns: props.columns, rows: props.rows, cells: props.cells }, activeKey))}>{t('property.grid.split')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => patchSelected({ bold: !(activeCell?.bold ?? false) })}>{t('property.grid.bold')}</Button>
        <Button size="compact" disabled={disabled} onClick={equalizeColumns}>{t('property.grid.equalColumns')}</Button>
        <Button size="compact" disabled={disabled} onClick={equalizeRows}>{t('property.grid.equalRows')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => applyBorders('all')}>{t('property.grid.borderAll')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => applyBorders('outer')}>{t('property.grid.borderOuter')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => applyBorders('inner')}>{t('property.grid.borderInner')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => applyBorders('innerHorizontal')}>{t('property.grid.borderInnerHorizontal')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => applyBorders('innerVertical')}>{t('property.grid.borderInnerVertical')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => applyBorders('top')}>{t('property.grid.borderTop')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => applyBorders('bottom')}>{t('property.grid.borderBottom')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => applyBorders('left')}>{t('property.grid.borderLeft')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => applyBorders('right')}>{t('property.grid.borderRight')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => applyBorders('clear')}>{t('property.grid.borderClear')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => clearSelected('content')}>{t('property.grid.clearContent')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => clearSelected('format')}>{t('property.grid.clearFormat')}</Button>
        <Button size="compact" disabled={disabled} onClick={() => clearSelected('all')}>{t('property.grid.clearAll')}</Button>
        <Button size="compact" onClick={() => void copySelection()}>{t('property.grid.copyTsv')}</Button>
        <Button size="compact" disabled={disabled || pasting} onClick={() => void pasteSelection()}>{pasting ? t('property.grid.pasting') : t('property.grid.pasteTsv')}</Button>
        <Button size="compact" onClick={copyActiveFormat}>{t('property.grid.copyFormat')}</Button>
        <Button size="compact" disabled={disabled || !copiedFormat} onClick={() => copiedFormat && patchSelected(copiedFormat)}>{t('property.grid.applyFormat')}</Button>
      </div>

      <p className="layoutpdf-grid-clipboard-hint">{t('property.grid.excelPasteHint')}</p>

      <div className="layoutpdf-grid-workspace-body">
        <div
          ref={viewportRef}
          className="layoutpdf-grid-viewport"
          role="grid"
          tabIndex={0}
          aria-rowcount={props.rows.length}
          aria-colcount={props.columns.length}
          aria-activedescendant={activeKey ? `grid-cell-${activeKey.replace(/[^a-zA-Z0-9_-]/g, '-')}` : undefined}
          onScroll={event => {
            const left = event.currentTarget.scrollLeft;
            const top = event.currentTarget.scrollTop;
            setViewport(current => ({ ...current, left, top }));
          }}
          onKeyDown={event => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
              event.preventDefault();
              event.stopPropagation();
              void copySelection();
              return;
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && !disabled) {
              event.preventDefault();
              event.stopPropagation();
              void pasteSelection();
              return;
            }
            const movement = event.key === 'ArrowUp' ? [-1, 0]
              : event.key === 'ArrowDown' ? [1, 0]
                : event.key === 'ArrowLeft' ? [0, -1]
                  : event.key === 'ArrowRight' ? [0, 1]
                    : undefined;
            if (movement) {
              event.preventDefault();
              event.stopPropagation();
              select({ row: focus.row + movement[0], column: focus.column + movement[1] }, event.shiftKey);
            } else if (event.key === 'Tab') {
              const cellCount = props.rows.length * props.columns.length;
              const current = focus.row * props.columns.length + focus.column;
              const next = current + (event.shiftKey ? -1 : 1);
              if (next < 0 || next >= cellCount) {
                if (focusOutsideGrid(event.currentTarget, event.shiftKey)) {
                  event.preventDefault();
                  event.stopPropagation();
                }
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              select({ row: Math.floor(next / props.columns.length), column: next % props.columns.length }, false);
            } else if (event.key === 'Enter' || event.key === 'F2') {
              event.preventDefault();
              event.stopPropagation();
              inputRef.current?.focus();
              inputRef.current?.select();
            } else if ((event.key === 'Delete' || event.key === 'Backspace') && !disabled) {
              event.preventDefault();
              event.stopPropagation();
              patchSelected({ content: '' });
            } else if (event.key === 'Escape' && (range.startRow !== range.endRow || range.startColumn !== range.endColumn)) {
              event.preventDefault();
              event.stopPropagation();
              setAnchor(focus);
            }
          }}
        >
          <div
            className="layoutpdf-grid-virtual-surface"
            style={{
              width: columnOffsets[columnOffsets.length - 1],
              height: rowOffsets[rowOffsets.length - 1],
            }}
          >
            {Array.from({ length: endColumn - startColumn + 1 }, (_, offset) => startColumn + offset).map(column => (
              <div
                key={`column:${column}`}
                className="layoutpdf-grid-column-header"
                style={{ left: columnOffsets[column], top: viewport.top, width: columnWidths[column], height: COLUMN_HEADER_HEIGHT }}
              >
                <button
                  type="button"
                  className="layoutpdf-grid-header-select"
                  aria-haspopup="menu"
                  draggable={!disabled}
                  onClick={event => {
                    if (event.shiftKey) {
                      setAnchor({ row: 0, column: anchor.column });
                      setFocus({ row: props.rows.length - 1, column });
                    } else {
                      setAnchor({ row: 0, column });
                      setFocus({ row: props.rows.length - 1, column });
                    }
                  }}
                  onContextMenu={event => handleHeaderContextMenu(event, 'column', column)}
                  onKeyDown={event => handleHeaderKeyDown(event, 'column', column)}
                  onDragStart={event => startHeaderDrag(event, 'column', column)}
                  onDragEnd={() => { draggedHeaderRef.current = undefined; }}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => dropHeader(event, 'column', column)}
                >
                  {gridColumnIndexToLabel(column).toUpperCase()}
                </button>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t('property.grid.resizeColumn', { column: gridColumnIndexToLabel(column).toUpperCase() })}
                  aria-valuemin={0.1}
                  aria-valuemax={4}
                  aria-valuenow={props.columns[column]?.width ?? 1}
                  tabIndex={disabled ? -1 : 0}
                  className="layoutpdf-grid-column-resize-handle"
                  onPointerDown={event => startHeaderResize(event, 'column', column)}
                  onPointerMove={moveHeaderResize}
                  onPointerUp={finishHeaderResize}
                  onPointerCancel={finishHeaderResize}
                  onKeyDown={event => resizeHeaderByKeyboard(event, 'column', column)}
                />
              </div>
            ))}
            {Array.from({ length: endRow - startRow + 1 }, (_, offset) => startRow + offset).map(row => (
              <div
                key={`row:${row}`}
                className="layoutpdf-grid-row-header"
                style={{ left: viewport.left, top: rowOffsets[row], width: ROW_HEADER_WIDTH, height: rowHeights[row] }}
              >
                <button
                  type="button"
                  className="layoutpdf-grid-header-select"
                  aria-haspopup="menu"
                  draggable={!disabled}
                  onClick={event => {
                    if (event.shiftKey) {
                      setAnchor({ row: anchor.row, column: 0 });
                      setFocus({ row, column: props.columns.length - 1 });
                    } else {
                      setAnchor({ row, column: 0 });
                      setFocus({ row, column: props.columns.length - 1 });
                    }
                  }}
                  onContextMenu={event => handleHeaderContextMenu(event, 'row', row)}
                  onKeyDown={event => handleHeaderKeyDown(event, 'row', row)}
                  onDragStart={event => startHeaderDrag(event, 'row', row)}
                  onDragEnd={() => { draggedHeaderRef.current = undefined; }}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => dropHeader(event, 'row', row)}
                >
                  {row + 1}
                </button>
                <span
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label={t('property.grid.resizeRow', { row: row + 1 })}
                  aria-valuemin={1}
                  aria-valuemax={50}
                  aria-valuenow={props.rows[row]?.height ?? (row === 0 ? props.style.headerHeight : props.style.rowHeight)}
                  tabIndex={disabled ? -1 : 0}
                  className="layoutpdf-grid-row-resize-handle"
                  onPointerDown={event => startHeaderResize(event, 'row', row)}
                  onPointerMove={moveHeaderResize}
                  onPointerUp={finishHeaderResize}
                  onPointerCancel={finishHeaderResize}
                  onKeyDown={event => resizeHeaderByKeyboard(event, 'row', row)}
                />
              </div>
            ))}
            <div className="layoutpdf-grid-corner" style={{ left: viewport.left, top: viewport.top, width: ROW_HEADER_WIDTH, height: COLUMN_HEADER_HEIGHT }} />
            {[...accessibleRows].sort((left, right) => left - right).map(row => {
              const ownedCells = [...visibleAnchors]
                .filter(key => parseAnchor(key, props)?.row === row)
                .map(key => `grid-cell-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`)
                .join(' ');
              return (
                <div
                  key={`accessible-row:${row}`}
                  className="layoutpdf-grid-accessible-row"
                  role="row"
                  aria-rowindex={row + 1}
                  aria-owns={ownedCells || undefined}
                />
              );
            })}
            {[...visibleAnchors].map(key => {
              const cell = props.cells[key];
              const coordinate = parseAnchor(key, props);
              if (!cell || !coordinate) return null;
              const selected = coordinate.row <= range.endRow
                && coordinate.row + (cell.rowSpan ?? 1) - 1 >= range.startRow
                && coordinate.column <= range.endColumn
                && coordinate.column + (cell.columnSpan ?? 1) - 1 >= range.startColumn;
              const referenced = formulaReferences.has(key);
              return (
                <button
                  type="button"
                  role="gridcell"
                  tabIndex={-1}
                  id={`grid-cell-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
                  aria-rowindex={coordinate.row + 1}
                  aria-colindex={coordinate.column + 1}
                  aria-selected={selected}
                  key={key}
                  className="layoutpdf-grid-editor-cell"
                  data-selected={selected || undefined}
                  data-formula-reference={referenced || undefined}
                  style={{
                    left: columnOffsets[coordinate.column],
                    top: rowOffsets[coordinate.row],
                    width: columnOffsets[Math.min(props.columns.length, coordinate.column + (cell.columnSpan ?? 1))] - columnOffsets[coordinate.column],
                    height: rowOffsets[Math.min(props.rows.length, coordinate.row + (cell.rowSpan ?? 1))] - rowOffsets[coordinate.row],
                    backgroundColor: cell.backgroundColor,
                    color: cell.color,
                    fontWeight: cell.bold ? 700 : 400,
                    fontSize: cell.fontSize ? `${cell.fontSize}pt` : undefined,
                    textAlign: cell.align ?? 'left',
                    alignItems: cell.verticalAlign === 'top' ? 'flex-start'
                      : cell.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                    justifyContent: cell.align === 'center' ? 'center'
                      : cell.align === 'right' ? 'flex-end' : 'flex-start',
                  }}
                  onDoubleClick={() => inputRef.current?.focus()}
                  onPointerDown={event => {
                    event.preventDefault();
                    setDragging(true);
                    if (!event.shiftKey && ((cell.rowSpan ?? 1) > 1 || (cell.columnSpan ?? 1) > 1)) {
                      setAnchor(coordinate);
                      setFocus({
                        row: Math.min(props.rows.length - 1, coordinate.row + (cell.rowSpan ?? 1) - 1),
                        column: Math.min(props.columns.length - 1, coordinate.column + (cell.columnSpan ?? 1) - 1),
                      });
                    } else {
                      select(coordinate, event.shiftKey);
                    }
                  }}
                  onPointerEnter={() => { if (dragging) select(coordinate, true); }}
                >
                  {cell.content}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="layoutpdf-grid-selection-inspector">
          <strong>{t('property.grid.selection', {
            start: `${gridColumnIndexToLabel(range.startColumn).toUpperCase()}${range.startRow + 1}`,
            end: `${gridColumnIndexToLabel(range.endColumn).toUpperCase()}${range.endRow + 1}`,
          })}</strong>
          <label>{t('property.grid.role')}
            <Select value={selectedRole ?? ''} placeholder={selectedRole ? undefined : t('property.panel.mixedValue')} disabled={disabled} onChange={value => patchSelected({ role: value as GridCell['role'] })} options={[
              { value: 'header', label: t('property.grid.roleHeader') },
              { value: 'body', label: t('property.grid.roleBody') },
              { value: 'footer', label: t('property.grid.roleFooter') },
            ]} />
          </label>
          <label>{t('property.common.horizontalAlign')}
            <Select value={selectedAlign ?? ''} placeholder={selectedAlign ? undefined : t('property.panel.mixedValue')} disabled={disabled} onChange={value => patchSelected({ align: value as GridCell['align'] })} options={[
              { value: 'left', label: t('property.option.alignLeft') },
              { value: 'center', label: t('property.option.alignCenter') },
              { value: 'right', label: t('property.option.alignRight') },
            ]} />
          </label>
          <label>{t('property.common.verticalAlign')}
            <Select value={selectedVerticalAlign ?? ''} placeholder={selectedVerticalAlign ? undefined : t('property.panel.mixedValue')} disabled={disabled} onChange={value => patchSelected({ verticalAlign: value as GridCell['verticalAlign'] })} options={[
              { value: 'top', label: t('property.option.alignTop') },
              { value: 'middle', label: t('property.option.alignMiddle') },
              { value: 'bottom', label: t('property.option.alignBottom') },
            ]} />
          </label>
          <label onBlur={() => endContinuousEdit('grid:selection:font-size')}>{t('property.common.fontSize')}
            <NumberInput
              min={6}
              max={72}
              value={selectedFontSize ?? null}
              placeholder={selectedFontSize === undefined ? t('property.panel.mixedValue') : '—'}
              disabled={disabled}
              onValueChange={fontSize => patchSelected({ fontSize: fontSize ?? undefined }, 'grid:selection:font-size')}
            />
          </label>
          <label onBlur={() => endContinuousEdit('grid:selection:text-color')}>{t('property.common.textColor')}
            <Input type="color" value={selectedTextColor ?? '#000000'} mixed={selectedTextColor === undefined && selectedCells.some(cell => cell.color !== undefined)} disabled={disabled} onChange={value => patchSelected({ color: typeof value === 'string' ? value : undefined }, 'grid:selection:text-color')} />
          </label>
          <label onBlur={() => endContinuousEdit('grid:selection:background')}>{t('property.grid.backgroundColor')}
            <span className="layoutpdf-grid-color-control">
              <Input type="color" value={selectedBackgroundColor ?? '#ffffff'} mixed={selectedBackgroundColor === undefined && selectedCells.some(cell => cell.backgroundColor !== undefined)} disabled={disabled} onChange={value => patchSelected({ backgroundColor: typeof value === 'string' ? value : undefined }, 'grid:selection:background')} />
              <IconButton size="sm" title={t('property.grid.clearBackgroundColor')} aria-label={t('property.grid.clearBackgroundColor')} disabled={disabled} onClick={() => patchSelected({ backgroundColor: undefined }, 'grid:selection:background')}>
                <Icon name="x" size={12} />
              </IconButton>
            </span>
          </label>
          {selectedKeys.length === 1 && activeCell ? (
            <div className="layoutpdf-grid-span-controls" onBlur={() => endContinuousEdit(`grid:cell:${activeKey}:span`)}>
              <label>{t('property.grid.columnSpan')}
                <NumberInput
                  min={1}
                  max={props.columns.length - (parseAnchor(activeKey, props)?.column ?? 0)}
                  value={activeCell.columnSpan ?? 1}
                  disabled={disabled}
                  onValueChange={columnSpan => {
                    if (columnSpan !== null) resizeActiveSpan(columnSpan, activeCell.rowSpan ?? 1, false, `grid:cell:${activeKey}:span`);
                  }}
                />
              </label>
              <label>{t('property.grid.rowSpan')}
                <NumberInput
                  min={1}
                  max={props.rows.length - (parseAnchor(activeKey, props)?.row ?? 0)}
                  value={activeCell.rowSpan ?? 1}
                  disabled={disabled}
                  onValueChange={rowSpan => {
                    if (rowSpan !== null) resizeActiveSpan(activeCell.columnSpan ?? 1, rowSpan, false, `grid:cell:${activeKey}:span`);
                  }}
                />
              </label>
            </div>
          ) : null}
          <label onBlur={() => endContinuousEdit(`grid:column:${activeColumn?.id ?? focus.column}:width`)}>{t('property.grid.columnWidth', { column: gridColumnIndexToLabel(focus.column).toUpperCase() })}
            <NumberInput
              min={0.1}
              step={0.1}
              value={props.columns[focus.column]?.width ?? null}
              disabled={disabled}
              onValueChange={width => {
                if (width === null || width <= 0) return;
                const columns = props.columns.map((column, index) => index === focus.column ? { ...column, width } : column);
                updateProps({ columns, rows: props.rows, cells: props.cells }, `grid:column:${activeColumn?.id ?? focus.column}:width`);
              }}
            />
          </label>
          <label onBlur={() => endContinuousEdit(`grid:row:${props.rows[focus.row]?.id ?? focus.row}:height`)}>{t('property.grid.rowHeight', { row: focus.row + 1 })}
            <NumberInput
              min={1}
              step={0.5}
              value={props.rows[focus.row]?.height ?? null}
              placeholder="—"
              disabled={disabled}
              onValueChange={height => {
                if (height === null || height <= 0) return;
                const rows = props.rows.map((row, index) => index === focus.row ? { ...row, height } : row);
                updateProps({ columns: props.columns, rows, cells: props.cells }, `grid:row:${props.rows[focus.row]?.id ?? focus.row}:height`);
              }}
            />
          </label>
          <p>{t('property.grid.selectionCount', { count: selectedKeys.length })}</p>
          {error ? <p className="layoutpdf-field-error" role="alert">{error}</p> : null}
        </aside>
      </div>
      <Dialog
        open={confirmMergeCells.length > 0}
        title={t('property.grid.mergeConfirmTitle')}
        description={t('property.grid.mergeConfirmDescriptionWithCells', { cells: confirmMergeCells.join(', ') })}
        onClose={() => setConfirmMergeCells([])}
        actions={(
          <>
            <Button onClick={() => setConfirmMergeCells([])}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={() => mergeSelection(true)}>{t('property.grid.mergeClear')}</Button>
          </>
        )}
      />
      <Dialog
        open={Boolean(pendingDelete)}
        title={t('property.grid.deleteReferencesTitle')}
        description={pendingDelete ? t('property.grid.deleteReferencesDescription', {
          count: pendingDelete.affectedFormulas,
          target: pendingDelete.kind === 'row'
            ? t('property.grid.rowAddress', { row: pendingDelete.index + 1 })
            : t('property.grid.columnAddress', { column: gridColumnIndexToLabel(pendingDelete.index).toUpperCase() }),
        }) : ''}
        onClose={() => setPendingDelete(undefined)}
        actions={(
          <>
            <Button onClick={() => setPendingDelete(undefined)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={() => pendingDelete && deleteStructure(pendingDelete.kind, pendingDelete.index)}>{t('property.grid.deleteAndInvalidate')}</Button>
          </>
        )}
      />
      <Dialog
        open={Boolean(pendingSpanChange)}
        title={t('property.grid.mergeConfirmTitle')}
        description={pendingSpanChange
          ? t('property.grid.mergeConfirmDescriptionWithCells', { cells: pendingSpanChange.conflicts.join(', ') })
          : ''}
        onClose={() => setPendingSpanChange(undefined)}
        actions={(
          <>
            <Button onClick={() => setPendingSpanChange(undefined)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => pendingSpanChange && resizeActiveSpan(pendingSpanChange.columnSpan, pendingSpanChange.rowSpan, true)}
            >
              {t('property.grid.mergeClear')}
            </Button>
          </>
        )}
      />
      <Dialog
        open={Boolean(pendingPaste)}
        title={t('property.grid.pasteExpandTitle')}
        description={pendingPaste ? t('property.grid.pasteExpandDescription', {
          rows: pendingPaste.targetRows,
          columns: pendingPaste.targetColumns,
        }) : ''}
        onClose={() => setPendingPaste(undefined)}
        actions={(
          <>
            <Button onClick={() => setPendingPaste(undefined)}>{t('common.cancel')}</Button>
            <Button disabled={pasting} onClick={() => pendingPaste && applyPaste(pendingPaste.values, true)}>{t('property.grid.expandAndPaste')}</Button>
          </>
        )}
      />
      {rowColumnMenu ? (
        <ContextMenu
          x={rowColumnMenu.x}
          y={rowColumnMenu.y}
          items={rowColumnMenuItems}
          onClose={closeRowColumnMenu}
        />
      ) : null}
    </section>
  );
}
