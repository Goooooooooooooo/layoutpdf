import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import type {
  TableColumn,
  TableFooter,
  TableFooterBand,
  TableFooterStyle,
  TableNumericFormat,
  TableValueRow,
} from '@/engine/renderTree/model.js';
import {
  TABLE_PAGINATION_DEFAULTS,
  TABLE_PAGINATION_LIMITS,
} from '@/engine/core/tablePaginationPolicy.js';
import {
  createDefaultTablePaginationOptions,
  normalizeTablePaginationOptions,
} from '@/engine/renderTree/tablePaginationOptions.js';
import { JsonValueSchema } from '@/engine/core/validation.js';
import { BorderSchema, BORDER_STYLE_OPTIONS } from '@/plugins/textShared.js';
import { getFormulaReferences, parseFormula } from '@/utils/calc.js';

const ExpressionFormulaSchema = z.object({
  kind: z.literal('expression'),
  expression: z.string().trim().min(1),
});

export const TableFormulaSchema = ExpressionFormulaSchema;

export function collectCyclicTableColumnKeys(
  columnDeps: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
  const cyclic = new Set<string>();
  const state = new Map<string, 'visiting' | 'visited'>();
  const stack: string[] = [];
  const visit = (key: string): void => {
    const current = state.get(key);
    if (current === 'visiting') {
      const from = stack.indexOf(key);
      for (let index = from; index < stack.length; index++) cyclic.add(stack[index]);
      return;
    }
    if (current === 'visited') return;
    state.set(key, 'visiting');
    stack.push(key);
    for (const dependency of columnDeps.get(key) ?? []) visit(dependency);
    stack.pop();
    state.set(key, 'visited');
  };
  for (const key of columnDeps.keys()) visit(key);
  return cyclic;
}

const TableColumnAlignSchema = z.enum(['left', 'center', 'right']);

export const TableNumericFormatSchema: z.ZodType<TableNumericFormat> = z.object({
  prefix: z.string(),
  symbolLayout: z.enum(['attached', 'edge']),
  zeroDisplay: z.enum(['zero', 'dash', 'blank']),
  emptyDisplay: z.enum(['blank', 'dash']),
});

export const TableColumnSchema: z.ZodType<TableColumn> = z.object({
  id: z.string().trim().min(1),
  label: z.string(),
  key: z.string().trim().min(1),
  width: z.number().positive(),
  valueType: z.enum(['text', 'number', 'currency', 'date', 'formula']),
  align: TableColumnAlignSchema,
  headerAlign: TableColumnAlignSchema.optional(),
  decimalPlaces: z.number().int().min(0).max(10).optional(),
  formula: TableFormulaSchema.optional(),
  numericFormat: TableNumericFormatSchema.optional(),
});

export const TableFooterSchema: z.ZodType<TableFooter> = z.object({
  id: z.string().trim().min(1),
  label: z.string(),
  formula: ExpressionFormulaSchema,
  bold: z.boolean().optional(),
  fontSize: z.number().positive().max(72).optional(),
  startColumnKey: z.string().trim().min(1).optional(),
  valueColumnKey: z.string().trim().min(1).optional(),
  outputFieldKey: z.string().trim().min(1).optional(),
  numericFormat: TableNumericFormatSchema.optional(),
});

const TableFooterBandSchema: z.ZodType<TableFooterBand> = z.object({
  enabled: z.boolean(),
  label: z.string(),
  startColumnKey: z.string().trim().min(1).optional(),
  leadWidth: z.number().positive(),
  headerHeight: z.number().positive(),
  valueHeight: z.number().positive(),
  items: z.array(z.object({
    footerId: z.string().trim().min(1),
    width: z.number().positive(),
  })),
});

const TableFooterStyleSchema: z.ZodType<TableFooterStyle> = z.object({
  borderPreset: z.enum(['inherit', 'top', 'outer', 'all', 'none', 'custom']),
  borderEdges: z.array(z.enum([
    'top',
    'bottom',
    'left',
    'right',
    'horizontal',
    'vertical',
  ])).optional(),
  border: BorderSchema,
  background: z.string().optional(),
  color: z.string().optional(),
});

export const TableValueRowSchema: z.ZodType<TableValueRow> = z.object({
  id: z.string().trim().min(1),
}).catchall(JsonValueSchema) as z.ZodType<TableValueRow>;

const TableStyleSchema = z.object({
  headerHeight: z.number().positive(),
  rowHeight: z.number().positive(),
  fontSize: z.number().positive(),
  cellPadding: z.number().min(0).max(10).optional(),
  headerBold: z.boolean().optional(),
  border: BorderSchema,
  headerBackground: z.string(),
  headerColor: z.string(),
  bodyColor: z.string(),
});

export const TablePaginationSchema = z.object({
  finalElementIds: z.array(z.string().trim().min(1)).max(TABLE_PAGINATION_LIMITS.maxElementReferences)
    .default(() => [...TABLE_PAGINATION_DEFAULTS.finalElementIds]),
  repeatElementIds: z.array(z.string().trim().min(1)).max(TABLE_PAGINATION_LIMITS.maxElementReferences)
    .default(() => [...TABLE_PAGINATION_DEFAULTS.repeatElementIds]),
  rowMode: z.enum(['compact', 'preserve']).default(TABLE_PAGINATION_DEFAULTS.rowMode),
  minRowsOnLastPage: z.number().int()
    .min(TABLE_PAGINATION_LIMITS.minRowsOnLastPage.min)
    .max(TABLE_PAGINATION_LIMITS.minRowsOnLastPage.max)
    .default(TABLE_PAGINATION_DEFAULTS.minRowsOnLastPage),
  gapAfterTable: z.number()
    .min(TABLE_PAGINATION_LIMITS.gapAfterTable.min)
    .max(TABLE_PAGINATION_LIMITS.gapAfterTable.max)
    .default(TABLE_PAGINATION_DEFAULTS.gapAfterTable),
  continuation: z.object({
    title: z.string().trim().max(200).optional(),
    showFragmentIndex: z.boolean().optional(),
  }).optional(),
});

export const TablePropsSchema = z.object({
  columns: z.array(TableColumnSchema).min(1),
  footers: z.array(TableFooterSchema),
  showInlineFooter: z.boolean().optional(),
  footerBand: TableFooterBandSchema.optional(),
  footerStyle: TableFooterStyleSchema.optional(),
  pagination: TablePaginationSchema.optional(),
  style: TableStyleSchema,
}).superRefine((props, context) => {
  if (props.pagination) {
    const finalIds = new Set<string>();
    props.pagination.finalElementIds.forEach((elementId, index) => {
      if (finalIds.has(elementId)) {
        context.addIssue({
          code: 'custom',
          path: ['pagination', 'finalElementIds', index],
          message: `Duplicate final-page element reference: ${elementId}`,
        });
      }
      finalIds.add(elementId);
    });
    const repeatIds = new Set<string>();
    props.pagination.repeatElementIds.forEach((elementId, index) => {
      if (repeatIds.has(elementId)) {
        context.addIssue({
          code: 'custom',
          path: ['pagination', 'repeatElementIds', index],
          message: `Duplicate repeated element reference: ${elementId}`,
        });
      }
      if (finalIds.has(elementId)) {
        context.addIssue({
          code: 'custom',
          path: ['pagination', 'repeatElementIds', index],
          message: `An element cannot be both final-page and repeated content: ${elementId}`,
        });
      }
      repeatIds.add(elementId);
    });
  }
  const columnIds = new Set<string>();
  const columnKeys = new Map<string, number>();
  props.columns.forEach((column, index) => {
    if (columnIds.has(column.id)) {
      context.addIssue({ code: 'custom', path: ['columns', index, 'id'], message: `Duplicate column id: ${column.id}` });
    }
    if (columnKeys.has(column.key)) {
      context.addIssue({ code: 'custom', path: ['columns', index, 'key'], message: `Duplicate column key: ${column.key}` });
    }
    columnIds.add(column.id);
    columnKeys.set(column.key, index);

    if (column.valueType === 'formula' && !column.formula) {
      context.addIssue({ code: 'custom', path: ['columns', index, 'formula'], message: 'Formula column requires a formula.' });
    }
    if (column.valueType !== 'formula' && column.formula) {
      context.addIssue({ code: 'custom', path: ['columns', index, 'formula'], message: 'Only formula columns may define a formula.' });
    }
  });

  props.columns.forEach((column, index) => {
    let references: string[] = [];
    if (column.formula) {
      try {
        references = getFormulaReferences(column.formula.expression);
      } catch (error) {
        context.addIssue({
          code: 'custom',
          path: ['columns', index, 'formula', 'expression'],
          message: error instanceof Error ? error.message : 'Invalid formula expression.',
        });
      }
    }
    for (const reference of references) {
      if (
        reference.startsWith('field.')
        || reference.startsWith('output.')
        || reference === 'rowNumber'
      ) {
        continue;
      }
      if (!reference.startsWith('row.')) {
        context.addIssue({
          code: 'custom',
          path: ['columns', index, 'formula'],
          message: `Unsupported row formula reference: ${reference}`,
        });
        continue;
      }
      const sourceKey = reference.slice('row.'.length);
      const sourceIndex = columnKeys.get(sourceKey);
      if (sourceIndex === undefined) {
        context.addIssue({ code: 'custom', path: ['columns', index, 'formula'], message: `Unknown formula source key: ${sourceKey}` });
      }
    }
  });

  const columnKeySet = new Set(props.columns.map(column => column.key));
  const columnDeps = new Map<string, Set<string>>();
  props.columns.forEach(column => {
    if (column.valueType !== 'formula' || !column.formula) return;
    const deps = new Set<string>();
    try {
      for (const reference of getFormulaReferences(column.formula.expression)) {
        if (reference.startsWith('row.')) {
          const key = reference.slice('row.'.length);
          if (columnKeySet.has(key)) deps.add(key);
        }
      }
    } catch {
      // Invalid expressions are reported through the expression check above.
    }
    columnDeps.set(column.key, deps);
  });
  const cyclicColumnKeys = collectCyclicTableColumnKeys(columnDeps);
  props.columns.forEach((column, index) => {
    if (column.valueType === 'formula' && cyclicColumnKeys.has(column.key)) {
      context.addIssue({
        code: 'custom',
        path: ['columns', index, 'formula'],
        message: 'Column formulas must not contain circular references.',
      });
    }
  });

  const footerIds = new Set(props.footers.map(footer => footer.id));
  const footerDependencies = new Map(
    props.footers.map(footer => [
      footer.id,
      (() => {
        try {
          return getFormulaReferences(footer.formula.expression)
            .filter(reference => reference.startsWith('footer.'))
            .map(reference => reference.slice('footer.'.length));
        } catch {
          return [];
        }
      })(),
    ]),
  );
  const duplicateFooterIds = new Set<string>();
  props.footers.forEach((footer, index) => {
    if (duplicateFooterIds.has(footer.id)) {
      context.addIssue({ code: 'custom', path: ['footers', index, 'id'], message: `Duplicate footer id: ${footer.id}` });
    }
    duplicateFooterIds.add(footer.id);
    const formula = footer.formula;
    try {
      parseFormula(formula.expression);
      for (const reference of getFormulaReferences(formula.expression)) {
        if (reference.startsWith('column.') && !columnKeys.has(reference.slice('column.'.length))) {
          context.addIssue({ code: 'custom', path: ['footers', index, 'formula'], message: `Unknown formula column: ${reference}` });
        }
        if (reference.startsWith('footer.') && !footerIds.has(reference.slice('footer.'.length))) {
          context.addIssue({ code: 'custom', path: ['footers', index, 'formula'], message: `Unknown formula footer: ${reference}` });
        }
        if (
          !reference.startsWith('column.')
          && !reference.startsWith('footer.')
          && !reference.startsWith('field.')
          && !reference.startsWith('output.')
        ) {
          context.addIssue({
            code: 'custom',
            path: ['footers', index, 'formula'],
            message: `Unsupported footer formula reference: ${reference}`,
          });
        }
      }
    } catch (error) {
      context.addIssue({
        code: 'custom',
        path: ['footers', index, 'formula', 'expression'],
        message: error instanceof Error ? error.message : 'Invalid footer expression.',
      });
    }
    const startColumnIndex = footer.startColumnKey === undefined
      ? 0
      : columnKeys.get(footer.startColumnKey);
    const valueColumnIndex = footer.valueColumnKey === undefined
      ? props.columns.length - 1
      : columnKeys.get(footer.valueColumnKey);
    if (startColumnIndex === undefined) {
      context.addIssue({ code: 'custom', path: ['footers', index, 'startColumnKey'], message: `Unknown footer start column key: ${footer.startColumnKey}` });
    }
    if (valueColumnIndex === undefined) {
      context.addIssue({ code: 'custom', path: ['footers', index, 'valueColumnKey'], message: `Unknown footer value column key: ${footer.valueColumnKey}` });
    }
    if (
      props.columns.length > 1
      && startColumnIndex !== undefined
      && valueColumnIndex !== undefined
      && startColumnIndex >= valueColumnIndex
    ) {
      context.addIssue({ code: 'custom', path: ['footers', index, 'startColumnKey'], message: 'Footer start column must be before its value column.' });
    }
  });
  const visitState = new Map<string, 'visiting' | 'visited'>();
  const hasCycle = (footerId: string): boolean => {
    const state = visitState.get(footerId);
    if (state === 'visiting') return true;
    if (state === 'visited') return false;
    visitState.set(footerId, 'visiting');
    const cyclic = (footerDependencies.get(footerId) ?? [])
      .filter(sourceId => footerIds.has(sourceId))
      .some(hasCycle);
    visitState.set(footerId, 'visited');
    return cyclic;
  };
  props.footers.forEach((footer, index) => {
    if (hasCycle(footer.id)) {
      context.addIssue({ code: 'custom', path: ['footers', index, 'formula'], message: 'Footer formulas must not contain circular references.' });
    }
  });
  const outputFieldKeys = new Set<string>();
  props.footers.forEach((footer, index) => {
    if (!footer.outputFieldKey) return;
    if (outputFieldKeys.has(footer.outputFieldKey)) {
      context.addIssue({ code: 'custom', path: ['footers', index, 'outputFieldKey'], message: `Duplicate footer output field: ${footer.outputFieldKey}` });
    }
    outputFieldKeys.add(footer.outputFieldKey);
  });
  if (props.footerBand?.startColumnKey && !columnKeys.has(props.footerBand.startColumnKey)) {
    context.addIssue({ code: 'custom', path: ['footerBand', 'startColumnKey'], message: `Unknown footer band start column: ${props.footerBand.startColumnKey}` });
  }
  const bandFooterIds = new Set<string>();
  props.footerBand?.items.forEach((item, index) => {
    if (!footerIds.has(item.footerId)) {
      context.addIssue({ code: 'custom', path: ['footerBand', 'items', index, 'footerId'], message: `Unknown footer band item: ${item.footerId}` });
    }
    if (bandFooterIds.has(item.footerId)) {
      context.addIssue({ code: 'custom', path: ['footerBand', 'items', index, 'footerId'], message: `Duplicate footer band item: ${item.footerId}` });
    }
    bandFooterIds.add(item.footerId);
  });
});

export type TableProps = z.infer<typeof TablePropsSchema>;
export const TableValueSchema = z.array(TableValueRowSchema).superRefine((rows, context) => {
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    if (ids.has(row.id)) {
      context.addIssue({ code: 'custom', path: [index, 'id'], message: `Duplicate row id: ${row.id}` });
    }
    ids.add(row.id);
  });
});

const DEFAULT_COLUMNS: TableColumn[] = [
  { id: 'col_item', label: '品名', key: 'item', width: 3, valueType: 'text', align: 'left', headerAlign: 'center' },
  { id: 'col_quantity', label: '数量', key: 'quantity', width: 1, valueType: 'number', align: 'right', headerAlign: 'center', decimalPlaces: 0 },
  { id: 'col_unit_price', label: '単価', key: 'unitPrice', width: 1.5, valueType: 'currency', align: 'right', headerAlign: 'center', decimalPlaces: 0 },
  {
    id: 'col_amount',
    label: '金額',
    key: 'amount',
    width: 1.5,
    valueType: 'formula',
    align: 'right',
    headerAlign: 'center',
    decimalPlaces: 0,
    formula: { kind: 'expression', expression: 'row.quantity * row.unitPrice' },
  },
];

const DEFAULT_FOOTERS: TableFooter[] = [
  { id: 'footer_subtotal', label: '小計', formula: { kind: 'expression', expression: 'SUM(column.amount)' } },
  { id: 'footer_tax', label: '消費税', formula: { kind: 'expression', expression: 'footer.footer_subtotal * 0.1' } },
  {
    id: 'footer_total',
    label: '合計',
    formula: { kind: 'expression', expression: 'footer.footer_subtotal + footer.footer_tax' },
    bold: true,
  },
];

function cloneColumn(column: TableColumn): TableColumn {
  if (!column.formula) return column.numericFormat
    ? { ...column, numericFormat: { ...column.numericFormat } }
    : { ...column };
  return {
    ...column,
    formula: { ...column.formula },
    ...(column.numericFormat ? { numericFormat: { ...column.numericFormat } } : {}),
  };
}

export const tablePlugin: LayoutPDFPlugin<TableProps, TableValueRow[]> = {
  metadata: {
    type: 'table',
    label: '表格',
    labelKey: 'plugin.table.label',
    category: 'business',
    bindingValueKind: 'table',
  },
  propsSchema: TablePropsSchema,
  valueSchema: TableValueSchema,
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'table',
      name: '明细表',
      box: { ...position, width: 180, height: 80 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: [],
      binding: { key: `field_${id}`, required: false },
      props: {
        columns: DEFAULT_COLUMNS.map(cloneColumn),
        footers: DEFAULT_FOOTERS.map(footer => ({
          ...footer,
          formula: { ...footer.formula },
        })),
        pagination: createDefaultTablePaginationOptions(),
        style: {
          headerHeight: 8,
          rowHeight: 7,
          fontSize: 10,
          cellPadding: 1.5,
          headerBold: true,
          border: { width: 0.5, color: '#d9d9d9', style: 'solid' },
          headerBackground: '#f5f5f5',
          headerColor: '#000000',
          bodyColor: '#333333',
        },
      },
    };
  },
  properties: [
    { path: 'binding.key', label: '数据字段', labelKey: 'property.binding.key', editor: 'text', group: 'data' },
    { path: 'binding.required', label: '必填', labelKey: 'property.binding.required', editor: 'switch', group: 'data' },
    { path: 'props.columns', label: '列和汇总', labelKey: 'property.table.columns', editor: 'tableColumns', group: 'content' },
    { path: 'props.style.headerHeight', label: '表头高度', labelKey: 'property.table.headerHeight', editor: 'number', min: 2, max: 50, group: 'layout' },
    { path: 'props.style.rowHeight', label: '行高', labelKey: 'property.table.rowHeight', editor: 'number', min: 2, max: 50, group: 'layout' },
    { path: 'props.style.cellPadding', label: '单元格内边距', labelKey: 'property.table.cellPadding', editor: 'number', min: 0, max: 10, step: 0.5, group: 'layout' },
    { path: 'props.style.fontSize', label: '字号', labelKey: 'property.common.fontSize', editor: 'number', min: 6, max: 72, group: 'style' },
    { path: 'props.style.headerBold', label: '表头粗体', labelKey: 'property.table.headerBold', editor: 'switch', group: 'style' },
    { path: 'props.style.headerBackground', label: '表头背景', labelKey: 'property.table.headerBackground', editor: 'color', group: 'style' },
    { path: 'props.style.headerColor', label: '表头文字', labelKey: 'property.table.headerColor', editor: 'color', group: 'style' },
    { path: 'props.style.border.color', label: '边框色', labelKey: 'property.common.borderColor', editor: 'color', group: 'style' },
    { path: 'props.style.border.width', label: '边框宽度', labelKey: 'property.common.borderWidth', editor: 'number', min: 0, max: 20, step: 0.5, group: 'style' },
    { path: 'props.style.border.style', label: '边框样式', labelKey: 'property.common.borderStyle', editor: 'select', group: 'style', options: BORDER_STYLE_OPTIONS },
    { path: 'props.style.bodyColor', label: '正文文字', labelKey: 'property.table.bodyColor', editor: 'color', group: 'style' },
  ],
  buildRenderNodes({ element, value, context }) {
    return [{
      kind: 'table',
      id: context.createNodeId('table'),
      sourceElementId: element.id,
      box: { ...element.box },
      rotate: element.rotate,
      opacity: element.opacity,
      clip: true,
      zIndex: 0,
      input: element.binding ? {
        key: element.binding.key,
        kind: 'table',
        value,
        required: element.binding.required,
      } : undefined,
      columns: element.props.columns.map(cloneColumn),
      formulaFields: Object.fromEntries(
        Object.entries(context.input).filter((entry): entry is [string, number | string] => (
          typeof entry[1] === 'number'
          || typeof entry[1] === 'string'
        )),
      ),
      rows: value.map(row => ({ ...row })),
      computedRows: [],
      footers: element.props.footers.map(footer => ({
        ...footer,
        numericFormat: footer.numericFormat ? { ...footer.numericFormat } : undefined,
        formula: { ...footer.formula },
      })),
      footerBand: element.props.footerBand ? {
        ...element.props.footerBand,
        items: element.props.footerBand.items.map(item => ({ ...item })),
      } : undefined,
      footerStyle: element.props.footerStyle ? {
        ...element.props.footerStyle,
        borderEdges: element.props.footerStyle.borderEdges
          ? [...element.props.footerStyle.borderEdges]
          : undefined,
        border: { ...element.props.footerStyle.border },
      } : undefined,
      showInlineFooter: element.props.showInlineFooter,
      pagination: element.props.pagination
        ? normalizeTablePaginationOptions(element.props.pagination)
        : undefined,
      computedFooters: [],
      layout: { cells: [], lines: [], height: 0 },
      style: {
        ...element.props.style,
        border: { ...element.props.style.border },
      },
    }];
  },
};
