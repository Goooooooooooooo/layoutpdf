import type {
  IdGenerator,
  TemplateElement,
  TemplatePage,
} from '@/engine/core/document.js';
import type {
  TableFooter,
  TableFooterBorderEdge,
  TableFooterStyle,
  TableValueRow,
} from '@/engine/renderTree/model.js';
import { findAvailablePosition } from '@/editor/layout/palettePlacement.js';
import type { SummaryBlockProps } from '@/plugins/summary/summary.js';
import {
  normalizeSummaryBorderEdges,
  summaryPlugin,
} from '@/plugins/summary/summary.js';
import type { TableProps } from '@/plugins/table/table.js';

export interface SummaryReferenceImpact {
  summaryElementId: string;
  summaryElementName: string;
  sourceElementId: string;
  outputId: string;
  itemId: string;
}

function overlaps(left: TemplateElement<object>['box'], right: TemplateElement<object>['box']): boolean {
  return left.x < right.x + right.width + 2
    && left.x + left.width + 2 > right.x
    && left.y < right.y + right.height + 2
    && left.y + left.height + 2 > right.y;
}

function rowsLayout(table: TemplateElement<TableProps, TableValueRow[]>): SummaryBlockProps['layout'] {
  if (table.props.columns.length === 1) {
    return { kind: 'rows', labelWidth: 60, valueWidth: 40 };
  }
  const footer = table.props.footers[0];
  const valueIndex = footer?.valueColumnKey
    ? table.props.columns.findIndex(column => column.key === footer.valueColumnKey)
    : -1;
  const resolvedValueIndex = valueIndex > 0 ? valueIndex : table.props.columns.length - 1;
  const startIndex = footer?.startColumnKey
    ? table.props.columns.findIndex(column => column.key === footer.startColumnKey)
    : -1;
  const resolvedStartIndex = startIndex >= 0 && startIndex < resolvedValueIndex
    ? startIndex
    : resolvedValueIndex - 1;
  return {
    kind: 'rows',
    labelWidth: table.props.columns
      .slice(resolvedStartIndex, resolvedValueIndex)
      .reduce((sum, column) => sum + column.width, 0),
    valueWidth: table.props.columns[resolvedValueIndex].width,
  };
}

function summaryBorder(
  footerStyle: TableFooterStyle | undefined,
): Pick<SummaryBlockProps['style'], 'borderPreset' | 'borderEdges'> {
  const preset = footerStyle?.borderPreset ?? 'inherit';
  if (preset === 'top') return { borderPreset: 'custom', borderEdges: ['top'] };
  if (preset === 'custom') {
    return {
      borderPreset: 'custom',
      borderEdges: normalizeSummaryBorderEdges(footerStyle?.borderEdges),
    };
  }
  if (preset === 'outer' || preset === 'none') return { borderPreset: preset };
  return { borderPreset: 'all' };
}

function itemWidth(
  footer: TableFooter,
  footerBand: TableProps['footerBand'],
): number {
  return footerBand?.items.find(item => item.footerId === footer.id)?.width ?? 1;
}

export function createSummaryElementFromTable(
  table: TemplateElement<TableProps, TableValueRow[]>,
  page: TemplatePage,
  idGenerator: IdGenerator,
): TemplateElement<SummaryBlockProps, null> {
  const summary = summaryPlugin.createDefaultElement({
    id: idGenerator('el'),
    position: { x: table.box.x, y: table.box.y + table.box.height + 2 },
  });
  const footerBand = table.props.footerBand;
  summary.props.items = table.props.footers.map(footer => ({
    id: idGenerator('el'),
    source: { sourceElementId: table.id, outputId: footer.id },
    labelMode: 'source',
    width: itemWidth(footer, footerBand),
    ...(footer.bold === undefined ? {} : { bold: footer.bold }),
    ...(footer.fontSize === undefined ? {} : { fontSize: footer.fontSize }),
  }));
  if (footerBand?.enabled) {
    summary.props.layout = {
      kind: 'band',
      leadLabel: footerBand.label,
      leadBold: true,
      leadWidth: footerBand.leadWidth,
      headerWeight: footerBand.headerHeight,
      valueWeight: footerBand.valueHeight,
    };
    summary.box.height = footerBand.headerHeight + footerBand.valueHeight;
  } else {
    summary.props.layout = rowsLayout(table);
    summary.box.height = table.props.footers.length * table.props.style.rowHeight;
  }
  const footerStyle = table.props.footerStyle;
  summary.props.style = {
    fontSize: table.props.style.fontSize,
    cellPadding: table.props.style.cellPadding ?? 1.5,
    labelBold: false,
    valueBold: false,
    labelColor: footerStyle?.color ?? table.props.style.headerColor,
    valueColor: footerStyle?.color ?? table.props.style.bodyColor,
    labelBackground: footerStyle?.background ?? table.props.style.headerBackground,
    ...(footerStyle?.background ? { valueBackground: footerStyle.background } : {}),
    border: { ...(footerStyle?.border ?? table.props.style.border) },
    ...summaryBorder(footerStyle),
  };
  const candidate = { ...summary.box };
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = page.padding;
  const fitsBelow = candidate.x >= paddingLeft
    && candidate.x + candidate.width <= page.size.width - paddingRight
    && candidate.y >= paddingTop
    && candidate.y + candidate.height <= page.size.height - paddingBottom
    && page.elements.every(element => element.id === table.id || !overlaps(candidate, element.box));
  if (!fitsBelow) {
    summary.box = {
      ...summary.box,
      ...findAvailablePosition(page, summary.box),
    };
  }
  return summary;
}

export function collectSummaryReferenceImpacts(
  page: TemplatePage,
  sourceElementIds: ReadonlySet<string>,
  outputIdsBySource?: ReadonlyMap<string, ReadonlySet<string>>,
): SummaryReferenceImpact[] {
  const impacts: SummaryReferenceImpact[] = [];
  for (const element of page.elements) {
    if (element.type !== 'summary') continue;
    const props = element.props as SummaryBlockProps;
    for (const item of props.items) {
      if (!sourceElementIds.has(item.source.sourceElementId)) continue;
      const outputIds = outputIdsBySource?.get(item.source.sourceElementId);
      if (outputIds && !outputIds.has(item.source.outputId)) continue;
      impacts.push({
        summaryElementId: element.id,
        summaryElementName: element.name,
        sourceElementId: item.source.sourceElementId,
        outputId: item.source.outputId,
        itemId: item.id,
      });
    }
  }
  return impacts;
}

export { removeSummaryReferences } from '@/engine/core/summaryReferences.js';

export function normalizeSummaryEdgesForStorage(
  edges: readonly TableFooterBorderEdge[] | undefined,
): TableFooterBorderEdge[] {
  return normalizeSummaryBorderEdges(edges);
}
