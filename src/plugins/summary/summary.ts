import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import type {
  ElementOutputRef,
  GridCell,
  GridOutputBinding,
  GridRow,
  TableFooterBorderEdge,
} from '@/engine/renderTree/model.js';
import { BorderSchema } from '@/plugins/textShared.js';

const SUMMARY_BORDER_EDGE_ORDER: TableFooterBorderEdge[] = [
  'top',
  'bottom',
  'left',
  'right',
  'horizontal',
  'vertical',
];

export function normalizeSummaryBorderEdges(
  edges: readonly TableFooterBorderEdge[] | undefined,
): TableFooterBorderEdge[] {
  const selected = new Set(edges ?? []);
  return SUMMARY_BORDER_EDGE_ORDER.filter(edge => selected.has(edge));
}

const ElementOutputRefSchema: z.ZodType<ElementOutputRef> = z.object({
  sourceElementId: z.string().trim().min(1),
  outputId: z.string().trim().min(1),
});

export const SummaryBlockItemSchema = z.object({
  id: z.string().trim().min(1),
  source: ElementOutputRefSchema,
  labelMode: z.enum(['source', 'custom']),
  customLabel: z.string().optional(),
  width: z.number().finite().positive().max(10000),
  bold: z.boolean().optional(),
  fontSize: z.number().finite().positive().max(72).optional(),
});

const SummaryBlockRowsLayoutSchema = z.object({
  kind: z.literal('rows'),
  labelWidth: z.number().finite().positive().max(10000),
  valueWidth: z.number().finite().positive().max(10000),
});

const SummaryBlockBandLayoutSchema = z.object({
  kind: z.literal('band'),
  leadLabel: z.string(),
  leadBold: z.boolean(),
  leadWidth: z.number().finite().positive().max(10000),
  headerWeight: z.number().finite().positive().max(10000),
  valueWeight: z.number().finite().positive().max(10000),
});

const SummaryBorderEdgeSchema = z.enum([
  'top',
  'bottom',
  'left',
  'right',
  'horizontal',
  'vertical',
]);

export const SummaryBlockStyleSchema = z.object({
  fontSize: z.number().finite().positive().max(72),
  cellPadding: z.number().finite().nonnegative().max(20),
  labelBold: z.boolean(),
  valueBold: z.boolean(),
  labelColor: z.string().min(1),
  valueColor: z.string().min(1),
  labelBackground: z.string().min(1),
  valueBackground: z.string().min(1).optional(),
  border: BorderSchema,
  borderPreset: z.enum(['outer', 'all', 'none', 'custom']),
  borderEdges: z.array(SummaryBorderEdgeSchema).optional(),
}).superRefine((style, context) => {
  const normalized = normalizeSummaryBorderEdges(style.borderEdges);
  if (style.borderPreset === 'custom') {
    if (normalized.length !== (style.borderEdges?.length ?? 0)
      || normalized.some((edge, index) => edge !== style.borderEdges?.[index])) {
      context.addIssue({
        code: 'custom',
        path: ['borderEdges'],
        message: 'Custom summary border edges must be unique and normalized.',
      });
    }
  } else if (style.borderEdges !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['borderEdges'],
      message: 'Summary border edges are only valid for the custom preset.',
    });
  }
});

export const SummaryBlockPropsSchema = z.object({
  items: z.array(SummaryBlockItemSchema),
  layout: z.discriminatedUnion('kind', [
    SummaryBlockRowsLayoutSchema,
    SummaryBlockBandLayoutSchema,
  ]),
  style: SummaryBlockStyleSchema,
}).superRefine((props, context) => {
  const itemIds = new Set<string>();
  const outputRefs = new Set<string>();
  props.items.forEach((item, index) => {
    if (itemIds.has(item.id)) {
      context.addIssue({
        code: 'custom',
        path: ['items', index, 'id'],
        message: `Duplicate summary item id: ${item.id}.`,
      });
    }
    itemIds.add(item.id);
    const ref = `${item.source.sourceElementId}\u0000${item.source.outputId}`;
    if (outputRefs.has(ref)) {
      context.addIssue({
        code: 'custom',
        path: ['items', index, 'source'],
        message: 'Duplicate summary output reference.',
      });
    }
    outputRefs.add(ref);
  });
});

export type SummaryBlockItem = z.infer<typeof SummaryBlockItemSchema>;
export type SummaryBlockRowsLayout = z.infer<typeof SummaryBlockRowsLayoutSchema>;
export type SummaryBlockBandLayout = z.infer<typeof SummaryBlockBandLayoutSchema>;
export type SummaryBlockStyle = z.infer<typeof SummaryBlockStyleSchema>;
export type SummaryBlockProps = z.infer<typeof SummaryBlockPropsSchema>;

function semanticEdges(style: SummaryBlockStyle): Set<TableFooterBorderEdge> {
  if (style.borderPreset === 'none') return new Set();
  if (style.borderPreset === 'outer') return new Set(['top', 'bottom', 'left', 'right']);
  if (style.borderPreset === 'all') {
    return new Set(['top', 'bottom', 'left', 'right', 'horizontal', 'vertical']);
  }
  return new Set(normalizeSummaryBorderEdges(style.borderEdges));
}

function cellBorders(
  edges: Set<TableFooterBorderEdge>,
  rowIndex: number,
  rowCount: number,
  columnIndex: number,
  columnCount: number,
  rowSpan = 1,
): NonNullable<GridCell['borders']> {
  return {
    top: rowIndex === 0 ? edges.has('top') : edges.has('horizontal'),
    bottom: rowIndex + rowSpan === rowCount ? edges.has('bottom') : false,
    left: columnIndex === 0 ? edges.has('left') : edges.has('vertical'),
    right: columnIndex === columnCount - 1 ? edges.has('right') : false,
  };
}

function itemBold(item: SummaryBlockItem, fallback: boolean): boolean {
  return item.bold ?? fallback;
}

function buildRows(
  items: SummaryBlockItem[],
  layout: SummaryBlockRowsLayout,
  style: SummaryBlockStyle,
  height: number,
): {
  columns: Array<{ id: string; key: string; width: number }>;
  rows: GridRow[];
  cells: Record<string, GridCell>;
  bindings: GridOutputBinding[];
} {
  const edges = semanticEdges(style);
  const columns = [
    { id: 'summary_label', key: 'label', width: layout.labelWidth },
    { id: 'summary_value', key: 'value', width: layout.valueWidth },
  ];
  const rowHeight = height / items.length;
  const rows = items.map(item => ({ id: `summary_row_${item.id}`, height: rowHeight }));
  const cells: Record<string, GridCell> = {};
  const bindings: GridOutputBinding[] = [];
  items.forEach((item, rowIndex) => {
    const labelKey = `${rowIndex}:label`;
    const valueKey = `${rowIndex}:value`;
    cells[labelKey] = {
      content: '',
      role: 'body',
      bold: itemBold(item, style.labelBold),
      ...(item.fontSize === undefined ? {} : { fontSize: item.fontSize }),
      align: 'right',
      verticalAlign: 'middle',
      borders: cellBorders(edges, rowIndex, rows.length, 0, columns.length),
      backgroundColor: style.labelBackground,
      color: style.labelColor,
    };
    cells[valueKey] = {
      content: '',
      role: 'body',
      bold: itemBold(item, style.valueBold),
      ...(item.fontSize === undefined ? {} : { fontSize: item.fontSize }),
      align: 'right',
      verticalAlign: 'middle',
      borders: cellBorders(edges, rowIndex, rows.length, 1, columns.length),
      ...(style.valueBackground ? { backgroundColor: style.valueBackground } : {}),
      color: style.valueColor,
    };
    bindings.push(
      {
        cellKey: labelKey,
        source: { ...item.source },
        part: 'label',
        labelMode: item.labelMode,
        ...(item.customLabel === undefined ? {} : { customLabel: item.customLabel }),
      },
      { cellKey: valueKey, source: { ...item.source }, part: 'value' },
    );
  });
  return { columns, rows, cells, bindings };
}

function buildBand(
  items: SummaryBlockItem[],
  layout: SummaryBlockBandLayout,
  style: SummaryBlockStyle,
  height: number,
): {
  columns: Array<{ id: string; key: string; width: number }>;
  rows: GridRow[];
  cells: Record<string, GridCell>;
  bindings: GridOutputBinding[];
} {
  const edges = semanticEdges(style);
  const totalHeightWeight = layout.headerWeight + layout.valueWeight;
  const columns = [
    { id: 'summary_lead', key: 'lead', width: layout.leadWidth },
    ...items.map(item => ({
      id: `summary_item_${item.id}`,
      key: `item_${item.id}`,
      width: item.width,
    })),
  ];
  const rows = [
    { id: 'summary_header', height: height * layout.headerWeight / totalHeightWeight },
    { id: 'summary_value', height: height * layout.valueWeight / totalHeightWeight },
  ];
  const cells: Record<string, GridCell> = {
    '0:lead': {
      content: layout.leadLabel,
      role: 'header',
      rowSpan: 2,
      bold: layout.leadBold,
      align: 'center',
      verticalAlign: 'middle',
      borders: cellBorders(edges, 0, 2, 0, columns.length, 2),
      backgroundColor: style.labelBackground,
      color: style.labelColor,
    },
  };
  const bindings: GridOutputBinding[] = [];
  items.forEach((item, itemIndex) => {
    const columnIndex = itemIndex + 1;
    const columnKey = `item_${item.id}`;
    const headerKey = `0:${columnKey}`;
    const valueKey = `1:${columnKey}`;
    cells[headerKey] = {
      content: '',
      role: 'header',
      bold: itemBold(item, style.labelBold),
      ...(item.fontSize === undefined ? {} : { fontSize: item.fontSize }),
      align: 'left',
      verticalAlign: 'middle',
      borders: cellBorders(edges, 0, 2, columnIndex, columns.length),
      backgroundColor: style.labelBackground,
      color: style.labelColor,
    };
    cells[valueKey] = {
      content: '',
      role: 'body',
      bold: itemBold(item, style.valueBold),
      ...(item.fontSize === undefined ? {} : { fontSize: item.fontSize }),
      align: 'right',
      verticalAlign: 'middle',
      borders: cellBorders(edges, 1, 2, columnIndex, columns.length),
      ...(style.valueBackground ? { backgroundColor: style.valueBackground } : {}),
      color: style.valueColor,
    };
    bindings.push(
      {
        cellKey: headerKey,
        source: { ...item.source },
        part: 'label',
        labelMode: item.labelMode,
        ...(item.customLabel === undefined ? {} : { customLabel: item.customLabel }),
      },
      { cellKey: valueKey, source: { ...item.source }, part: 'value' },
    );
  });
  return { columns, rows, cells, bindings };
}

export const summaryPlugin: LayoutPDFPlugin<SummaryBlockProps, null> = {
  metadata: {
    type: 'summary',
    label: '汇总块',
    labelKey: 'plugin.summary.label',
    category: 'business',
  },
  propsSchema: SummaryBlockPropsSchema,
  valueSchema: z.null(),
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'summary',
      name: '汇总块',
      box: { ...position, width: 80, height: 24 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: null,
      props: {
        items: [],
        layout: { kind: 'rows', labelWidth: 3, valueWidth: 2 },
        style: {
          fontSize: 10,
          cellPadding: 1.5,
          labelBold: false,
          valueBold: false,
          labelColor: '#000000',
          valueColor: '#333333',
          labelBackground: '#f5f5f5',
          border: { width: 0.5, color: '#d9d9d9', style: 'solid' },
          borderPreset: 'all',
        },
      },
    };
  },
  properties: [],
  buildRenderNodes({ element, context }) {
    if (element.props.items.length === 0) {
      context.report({
        severity: 'warning',
        code: 'SUMMARY_BLOCK_UNCONFIGURED',
        message: 'Summary block has no configured outputs.',
      });
      const emptyCell: GridCell = {
        content: '',
        role: 'body',
        borders: { top: false, bottom: false, left: false, right: false },
      };
      return [{
        kind: 'grid',
        id: context.createNodeId('summary'),
        sourceElementId: element.id,
        box: { ...element.box },
        rotate: element.rotate,
        opacity: element.opacity,
        clip: true,
        zIndex: 0,
        columns: [{ id: 'summary_empty', key: 'empty', width: 1 }],
        rows: [{ id: 'summary_empty', height: element.box.height }],
        cells: { '0:empty': emptyCell },
        computedCells: { '0:empty': { ...emptyCell, borders: { ...emptyCell.borders } } },
        outputBindings: [],
        layout: { cells: [], lines: [], height: 0 },
        style: {
          border: { ...element.props.style.border, width: 0 },
          headerHeight: element.box.height,
          rowHeight: element.box.height,
          fontSize: element.props.style.fontSize,
          cellPadding: element.props.style.cellPadding,
        },
      }];
    }
    const built = element.props.layout.kind === 'rows'
      ? buildRows(element.props.items, element.props.layout, element.props.style, element.box.height)
      : buildBand(element.props.items, element.props.layout, element.props.style, element.box.height);
    const cells = Object.fromEntries(Object.entries(built.cells).map(([key, cell]) => [
      key,
      { ...cell, borders: cell.borders ? { ...cell.borders } : undefined },
    ]));
    return [{
      kind: 'grid',
      id: context.createNodeId('summary'),
      sourceElementId: element.id,
      box: { ...element.box },
      rotate: element.rotate,
      opacity: element.opacity,
      clip: true,
      zIndex: 0,
      columns: built.columns.map(column => ({ ...column })),
      rows: built.rows.map(row => ({ ...row })),
      cells,
      computedCells: structuredClone(cells),
      outputBindings: built.bindings.map(binding => ({
        ...binding,
        source: { ...binding.source },
      })),
      layout: { cells: [], lines: [], height: 0 },
      style: {
        border: { ...element.props.style.border },
        headerHeight: built.rows[0]?.height ?? element.box.height,
        rowHeight: built.rows.at(-1)?.height ?? element.box.height,
        fontSize: element.props.style.fontSize,
        cellPadding: element.props.style.cellPadding,
      },
    }];
  },
};
