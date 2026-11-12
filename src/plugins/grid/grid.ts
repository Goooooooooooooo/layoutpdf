import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import type {
  GridCell,
  GridCellRole,
  GridColumn,
  GridRow,
} from '@/engine/renderTree/model.js';
import { evaluateGridFormulaCells } from '@/plugins/grid/formula.js';
import { BORDER_STYLE_OPTIONS } from '@/plugins/textShared.js';
import { TEMPLATE_COMPLEXITY_LIMITS } from '@/engine/utils/limits.js';

const CellRoleSchema: z.ZodType<GridCellRole> = z.enum(['header', 'body', 'footer']);

const GridCellSchema = z.object({
  content: z.string(),
  role: CellRoleSchema,
  columnSpan: z.number().int().min(1).optional(),
  rowSpan: z.number().int().min(1).optional(),
  bold: z.boolean().optional(),
  fontSize: z.number().positive().max(72).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  borders: z.object({
    top: z.boolean().optional(),
    bottom: z.boolean().optional(),
    left: z.boolean().optional(),
    right: z.boolean().optional(),
  }).optional(),
  backgroundColor: z.string().optional(),
  color: z.string().optional(),
});

const GridColumnSchema: z.ZodType<GridColumn> = z.object({
  id: z.string().trim().min(1),
  key: z.string().trim().min(1),
  width: z.number().positive(),
});

const GridRowSchema: z.ZodType<GridRow> = z.object({
  id: z.string().trim().min(1),
  height: z.number().positive().optional(),
});

const GridStyleSchema = z.object({
  border: z.object({
    width: z.number().nonnegative(),
    color: z.string(),
    style: z.enum(['solid', 'dashed', 'dotted']),
  }),
  headerHeight: z.number().positive(),
  rowHeight: z.number().positive(),
  fontSize: z.number().positive(),
  cellPadding: z.number().finite().nonnegative().max(20).optional(),
});

export const GridPropsSchema = z.object({
  columns: z.array(GridColumnSchema).min(1).max(TEMPLATE_COMPLEXITY_LIMITS.maxGridColumnsPerElement),
  rows: z.array(GridRowSchema).min(1).max(TEMPLATE_COMPLEXITY_LIMITS.maxGridRowsPerElement),
  cells: z.record(z.string(), GridCellSchema),
  style: GridStyleSchema,
}).superRefine((props, context) => {
  if (Object.keys(props.cells).length > TEMPLATE_COMPLEXITY_LIMITS.maxGridCellsPerElement) {
    context.addIssue({
      code: 'custom',
      path: ['cells'],
      message: `Grid cell count exceeds ${TEMPLATE_COMPLEXITY_LIMITS.maxGridCellsPerElement}.`,
    });
  }
  const columnKeys = new Set<string>();
  const columnIds = new Set<string>();
  props.columns.forEach((col, index) => {
    if (columnKeys.has(col.key)) {
      context.addIssue({ code: 'custom', path: ['columns', index, 'key'], message: `Duplicate column key: ${col.key}` });
    }
    columnKeys.add(col.key);
    if (columnIds.has(col.id)) {
      context.addIssue({ code: 'custom', path: ['columns', index, 'id'], message: `Duplicate column id: ${col.id}` });
    }
    columnIds.add(col.id);
  });
  const rowIds = new Set<string>();
  props.rows.forEach((row, index) => {
    if (rowIds.has(row.id)) {
      context.addIssue({ code: 'custom', path: ['rows', index, 'id'], message: `Duplicate row id: ${row.id}` });
    }
    rowIds.add(row.id);
  });

  for (const [key, cell] of Object.entries(props.cells)) {
    const parts = key.split(':');
    if (parts.length !== 2) {
      context.addIssue({ code: 'custom', path: ['cells', key], message: `Invalid cell key format: ${key}. Expected "rowIndex:colKey".` });
      continue;
    }
    const canonicalRow = /^(0|[1-9]\d*)$/.test(parts[0]);
    const rowIndex = canonicalRow ? Number(parts[0]) : Number.NaN;
    if (!canonicalRow || !Number.isSafeInteger(rowIndex) || rowIndex < 0 || rowIndex >= props.rows.length) {
      context.addIssue({ code: 'custom', path: ['cells', key], message: `Cell key ${key} has row index ${rowIndex} out of bounds (0-${props.rows.length - 1}).` });
    }
    if (!columnKeys.has(parts[1])) {
      context.addIssue({ code: 'custom', path: ['cells', key], message: `Cell key ${key} references unknown column key: ${parts[1]}.` });
    }
    const columnIndex = props.columns.findIndex(column => column.key === parts[1]);
    const columnSpan = cell.columnSpan ?? 1;
    const rowSpan = cell.rowSpan ?? 1;
    if (columnIndex >= 0 && columnIndex + columnSpan > props.columns.length) {
      context.addIssue({ code: 'custom', path: ['cells', key, 'columnSpan'], message: `Cell ${key} exceeds the available columns.` });
    }
    if (Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < props.rows.length && rowIndex + rowSpan > props.rows.length) {
      context.addIssue({ code: 'custom', path: ['cells', key, 'rowSpan'], message: `Cell ${key} exceeds the available rows.` });
    }
  }

  const occupied = new Map<string, string>();
  let coverageVisits = 0;
  cellCoverage:
  for (const [key, cell] of Object.entries(props.cells)) {
    const [rawRow, columnKey] = key.split(':');
    const rowIndex = /^(0|[1-9]\d*)$/.test(rawRow) ? Number(rawRow) : Number.NaN;
    const columnIndex = props.columns.findIndex(column => column.key === columnKey);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || columnIndex < 0) continue;
    const rowSpan = Math.min(cell.rowSpan ?? 1, Math.max(0, props.rows.length - rowIndex));
    const columnSpan = Math.min(cell.columnSpan ?? 1, Math.max(0, props.columns.length - columnIndex));
    for (let rowOffset = 0; rowOffset < rowSpan; rowOffset++) {
      for (let columnOffset = 0; columnOffset < columnSpan; columnOffset++) {
        coverageVisits += 1;
        if (coverageVisits > TEMPLATE_COMPLEXITY_LIMITS.maxGridCellsPerElement) {
          context.addIssue({
            code: 'custom',
            path: ['cells'],
            message: `Grid merged coverage exceeds ${TEMPLATE_COMPLEXITY_LIMITS.maxGridCellsPerElement} slots.`,
          });
          break cellCoverage;
        }
        const slot = `${rowIndex + rowOffset}:${columnIndex + columnOffset}`;
        const owner = occupied.get(slot);
        if (owner && owner !== key) {
          context.addIssue({ code: 'custom', path: ['cells', key], message: `Cell ${key} overlaps merged cell ${owner}.` });
        } else {
          occupied.set(slot, key);
        }
      }
    }
  }
});

export type GridProps = z.infer<typeof GridPropsSchema>;

const columnLetters = 'abcdefghijklmnopqrstuvwxyz';

function createDefaultColumns(count: number): GridColumn[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `col_${columnLetters[i]}`,
    key: columnLetters[i],
    width: 1,
  }));
}

function createDefaultRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row_${i}`,
  }));
}

function createDefaultCells(columns: number, rows: number): Record<string, GridCell> {
  const cells: Record<string, GridCell> = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const colKey = columnLetters[c];
      cells[`${r}:${colKey}`] = {
        content: '',
        role: r === 0 ? 'header' : 'body',
        align: 'left',
        borders: {
          top: true,
          bottom: true,
          left: c === 0,
          right: c === columns - 1,
        },
      };
    }
  }
  return cells;
}

export const gridPlugin: LayoutPDFPlugin<GridProps, string> = {
  metadata: {
    type: 'grid',
    label: '自由网格',
    labelKey: 'plugin.grid.label',
    category: 'layout',
  },
  propsSchema: GridPropsSchema,
  valueSchema: z.string(),
  createDefaultElement({ id, position }) {
    const columns = createDefaultColumns(4);
    const rows = createDefaultRows(5);
    return {
      id,
      type: 'grid',
      name: '自由网格',
      box: { ...position, width: 180, height: 60 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: '',
      props: {
        columns,
        rows,
        cells: createDefaultCells(4, 5),
        style: {
          border: { width: 0.5, color: '#d9d9d9', style: 'solid' },
          headerHeight: 8,
          rowHeight: 8,
          fontSize: 10,
        },
      },
    };
  },
  properties: [
    { path: 'props.cells', label: '单元格', labelKey: 'property.grid.cells', editor: 'gridCells', group: 'content' },
    { path: 'props.style.headerHeight', label: '表头高度', labelKey: 'property.table.headerHeight', editor: 'number', min: 2, max: 50, group: 'layout' },
    { path: 'props.style.rowHeight', label: '行高', labelKey: 'property.table.rowHeight', editor: 'number', min: 2, max: 50, group: 'layout' },
    { path: 'props.style.fontSize', label: '字号', labelKey: 'property.common.fontSize', editor: 'number', min: 6, max: 72, group: 'style' },
    { path: 'props.style.border.color', label: '边框色', labelKey: 'property.common.borderColor', editor: 'color', group: 'style' },
    { path: 'props.style.border.width', label: '边框宽度', labelKey: 'property.common.borderWidth', editor: 'number', min: 0, max: 20, step: 0.5, group: 'style' },
    { path: 'props.style.border.style', label: '边框样式', labelKey: 'property.common.borderStyle', editor: 'select', group: 'style', options: BORDER_STYLE_OPTIONS },
  ],
  buildRenderNodes({ element, context }) {
    const cellEntries = Object.entries(element.props.cells);
    const columnKeys = element.props.columns.map(column => column.key);

    const computedCells: Record<string, GridCell> = Object.fromEntries(cellEntries.map(([key, cell]) => [
      key,
      { ...cell, borders: cell.borders ? { ...cell.borders } : undefined },
    ]));
    const validCellKeys = new Set(element.props.rows.flatMap((_, rowIndex) =>
      element.props.columns.map(column => `${rowIndex}:${column.key}`)
    ));
    const formulaResult = evaluateGridFormulaCells(
      Object.fromEntries(cellEntries.map(([key, cell]) => [key, cell.content])),
      {
      columnKeys,
      rowCount: element.props.rows.length,
      validCellKeys,
      }
    );
    for (const [key, value] of Object.entries(formulaResult.values)) {
      if (element.props.cells[key]?.content.startsWith('=')) {
        computedCells[key] = { ...computedCells[key], content: String(value) };
      }
    }
    for (const key of formulaResult.invalidKeys) {
      computedCells[key] = { ...computedCells[key], content: '#ERR' };
      context.report({
        severity: 'error',
        code: 'INVALID_GRID_FORMULA',
        message: `Invalid grid formula in cell ${key}.`,
      });
    }
    for (const key of formulaResult.cycleKeys) {
      computedCells[key] = { ...computedCells[key], content: '#CYCLE' };
      context.report({
        severity: 'error',
        code: 'GRID_FORMULA_CYCLE',
        message: `Circular grid formula reference in cell ${key}.`,
      });
    }

    return [{
      kind: 'grid',
      id: context.createNodeId('grid'),
      sourceElementId: element.id,
      box: { ...element.box },
      rotate: element.rotate,
      opacity: element.opacity,
      clip: true,
      zIndex: 0,
      columns: element.props.columns.map(col => ({ ...col })),
      rows: element.props.rows.map(row => ({ ...row })),
      cells: Object.fromEntries(cellEntries.map(([key, cell]) => [
        key,
        { ...cell, borders: cell.borders ? { ...cell.borders } : undefined },
      ])),
      computedCells,
      layout: { cells: [], lines: [], height: 0 },
      style: { ...element.props.style, border: { ...element.props.style.border } },
    }];
  },
};
