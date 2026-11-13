import type { JsonValue } from '@/engine/core/document.js';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import { resolveFontFace } from '@/engine/pdf/font/fontManager.js';
import { pdfPtToMm } from '@/engine/utils/units.js';
import { formatDateValue } from '@/i18n/formatters.js';
import type { FormatLocaleSettings } from '@/i18n/locales.js';
import type {
  BorderStyle,
  TableColumn,
  TableFooterBorderEdge,
  TableLayoutCell,
  TableLayoutLine,
  TableNode,
} from '@/engine/renderTree/model.js';
import { FORMULA_ERROR } from '@/engine/renderTree/model.js';
import { formulaErrorText } from '@/i18n/locales.js';
import { resolveHeaderAlign } from '@/engine/renderTree/tableAlign.js';
import { resolveTableFooterBorderEdges } from '@/engine/renderTree/tableFooterBorders.js';
import { formatNumericPresentation } from '@/engine/renderTree/numericPresentation.js';
import { wrapMeasuredText } from '@/engine/renderTree/textLayout.js';

export const DEFAULT_TABLE_CELL_PADDING_MM = 1.5;

export const FORMULA_ERROR_BACKGROUND = '#fee2e2';

interface DisplayValue {
  text: string;
  prefixText?: string;
  error?: boolean;
}

function displayValue(
  value: JsonValue | undefined,
  column: TableColumn,
  format: FormatLocaleSettings,
): DisplayValue {
  if (column.valueType === 'formula' && value === FORMULA_ERROR) {
    return { text: formulaErrorText(format.locale), error: true };
  }
  if (value === undefined || value === null || value === '') {
    return { text: column.numericFormat?.emptyDisplay === 'dash' ? '-' : '' };
  }
  if (Array.isArray(value) || typeof value === 'object') {
    throw new Error(`Table column "${column.key}" contains a non-primitive value.`);
  }
  if (column.valueType === 'date') {
    return { text: formatDateValue(String(value), {
      locale: format.locale,
      calendar: format.calendar,
      format: 'long',
    }) };
  }
  if (column.valueType === 'currency' || column.valueType === 'number' || column.valueType === 'formula') {
    return formatNumericPresentation(
      value,
      column.numericFormat,
      column.decimalPlaces ?? 0,
      format,
      column.valueType === 'currency',
    );
  }
  return { text: String(value) };
}

function measureMm(
  fontManager: FontManager,
  fontName: string,
  text: string,
  fontSize: number,
): number {
  return pdfPtToMm(fontManager.measureText(fontName, text, fontSize));
}

function fitText(
  text: string,
  maxWidth: number,
  fontManager: FontManager,
  fontName: string,
  fontSize: number,
): { text: string; width: number } {
  fontManager.assertTextSupported(fontName, text);
  const fullWidth = measureMm(fontManager, fontName, text, fontSize);
  if (fullWidth <= maxWidth) return { text, width: fullWidth };

  const suffix = '...';
  fontManager.assertTextSupported(fontName, suffix);
  const suffixWidth = measureMm(fontManager, fontName, suffix, fontSize);
  if (suffixWidth > maxWidth) return { text: '', width: 0 };

  const chars = Array.from(text);
  let low = 0;
  let high = chars.length;
  let length = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = chars.slice(0, middle).join('');
    if (measureMm(fontManager, fontName, candidate, fontSize) + suffixWidth <= maxWidth) {
      length = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const fitted = chars.slice(0, length).join('') + suffix;
  return { text: fitted, width: measureMm(fontManager, fontName, fitted, fontSize) };
}

function textX(
  align: TableLayoutCell['align'],
  x: number,
  width: number,
  textWidth: number,
  padding: number,
): number {
  if (align === 'center') return x + Math.max(0, (width - textWidth) / 2);
  if (align === 'right') return x + Math.max(padding, width - padding - textWidth);
  return x + padding;
}

function columnGeometry(node: TableNode): { widths: number[]; xPositions: number[] } {
  const totalWeight = node.columns.reduce((sum, column) => sum + column.width, 0);
  const widths = node.columns.map(column => node.box.width * column.width / totalWeight);
  const xPositions: number[] = [];
  widths.reduce((x, width) => {
    xPositions.push(x);
    return x + width;
  }, 0);
  return { widths, xPositions };
}

export function measureTableRowHeights(
  node: TableNode,
  fontManager: FontManager,
  format: FormatLocaleSettings,
): TableNode {
  const fontName = fontManager.getDefaultFontName();
  const padding = node.style.cellPadding ?? DEFAULT_TABLE_CELL_PADDING_MM;
  const { widths } = columnGeometry(node);
  const lineHeightMm = pdfPtToMm(node.style.fontSize * 1.2);
  const rowHeights = node.computedRows.map(row => node.columns.reduce((height, column, columnIndex) => {
    if (column.valueType !== 'text') return height;
    const value = displayValue(row[column.key], column, format);
    const lines = wrapMeasuredText(
      value.text,
      Math.max(0, widths[columnIndex] - padding * 2),
      fontManager,
      fontName,
      node.style.fontSize,
    );
    return Math.max(height, padding * 2 + lines.length * lineHeightMm);
  }, node.style.rowHeight));
  const continuationTitle = node.pagination?.continuation?.title?.trim();
  const continuationTitleFontName = resolveFontFace(fontManager, fontName, 'bold').name;
  const continuationTitleHeight = continuationTitle
    ? Math.max(
        node.style.rowHeight,
        padding * 2 + wrapMeasuredText(
          node.pagination?.continuation?.showFragmentIndex
            ? `${continuationTitle} ${Math.max(1, node.computedRows.length + 1)}`
            : continuationTitle,
          Math.max(0, node.box.width),
          fontManager,
          continuationTitleFontName,
          node.style.fontSize,
        ).length * lineHeightMm,
      )
    : undefined;
  return {
    ...node,
    rowHeights,
    ...(continuationTitleHeight ? { continuationTitleHeight } : {}),
  };
}

function createCell(args: {
  id: string;
  role: TableLayoutCell['role'];
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  prefixText?: string;
  align: TableLayoutCell['align'];
  color: string;
  backgroundColor?: string;
  bold: boolean;
  fontManager: FontManager;
  fontName: string;
  fontSize: number;
  padding: number;
  rowIndex?: number;
  column?: TableColumn;
  wrap?: boolean;
}): TableLayoutCell {
  const face = resolveFontFace(
    args.fontManager,
    args.fontName,
    args.bold ? 'bold' : 'normal',
  );
  const lineHeightMm = pdfPtToMm(args.fontSize * 1.2);
  const maxTextWidth = Math.max(0, args.width - args.padding * 2);
  const wrapped = args.wrap
    ? wrapMeasuredText(
        args.text,
        maxTextWidth,
        args.fontManager,
        face.name,
        args.fontSize,
      )
    : undefined;
  const fitted = wrapped?.[0] ?? fitText(
    args.text,
    maxTextWidth,
    args.fontManager,
    face.name,
    args.fontSize,
  );
  const prefix = args.prefixText
    ? fitText(args.prefixText, Math.max(0, args.width - args.padding * 2), args.fontManager, face.name, args.fontSize)
    : undefined;
  const contentHeight = Math.max(0, args.height - args.padding * 2);
  const textBlockHeight = (wrapped?.length ?? 1) * lineHeightMm;
  const textBlockY = args.y + args.padding + Math.max(0, (contentHeight - textBlockHeight) / 2);
  const lines = wrapped?.map((line, index) => ({
    text: line.text,
    x: textX(args.align, args.x, args.width, line.width, args.padding),
    y: textBlockY + index * lineHeightMm,
    width: line.width,
  }));
  return {
    id: args.id,
    role: args.role,
    box: { x: args.x, y: args.y, width: args.width, height: args.height },
    text: fitted.text,
    textX: textX(args.align, args.x, args.width, fitted.width, args.padding),
    textY: textBlockY,
    textWidth: wrapped ? Math.max(0, ...wrapped.map(line => line.width)) : fitted.width,
    lines,
    prefixText: prefix?.text,
    prefixTextX: prefix ? args.x + args.padding : undefined,
    prefixTextWidth: prefix?.width,
    lineHeightMm,
    fontSize: args.fontSize,
    align: args.align,
    color: args.color,
    backgroundColor: args.backgroundColor,
    bold: args.bold,
    fontName: face.name,
    syntheticBold: face.syntheticBold,
    rowIndex: args.rowIndex,
    columnKey: args.column?.key,
    valueType: args.column?.valueType,
  };
}

function addCellLines(
  cell: TableLayoutCell,
  lines: TableLayoutLine[],
  border?: BorderStyle,
): void {
  const { x, y, width, height } = cell.box;
  const segments: TableLayoutLine[] = [
    { from: { x, y }, to: { x: x + width, y }, border },
    { from: { x: x + width, y }, to: { x: x + width, y: y + height }, border },
    { from: { x: x + width, y: y + height }, to: { x, y: y + height }, border },
    { from: { x, y: y + height }, to: { x, y }, border },
  ];
  lines.push(...segments);
}

interface LineInterval {
  start: number;
  end: number;
}

interface LineGroup {
  fixed: number;
  intervals: LineInterval[];
  border?: BorderStyle;
}

const LINE_MERGE_EPSILON = 0.000001;

function mergeLineGroups(
  groups: Map<string, LineGroup>,
  orientation: 'horizontal' | 'vertical',
): TableLayoutLine[] {
  const output: TableLayoutLine[] = [];
  for (const group of groups.values()) {
    const intervals = [...group.intervals].sort((left, right) =>
      left.start - right.start || left.end - right.end
    );
    let current = intervals[0];
    if (!current) continue;
    for (const interval of intervals.slice(1)) {
      if (interval.start <= current.end + LINE_MERGE_EPSILON) {
        current = { ...current, end: Math.max(current.end, interval.end) };
        continue;
      }
      output.push(orientation === 'horizontal'
        ? {
            from: { x: current.start, y: group.fixed },
            to: { x: current.end, y: group.fixed },
            border: group.border,
          }
        : {
            from: { x: group.fixed, y: current.start },
            to: { x: group.fixed, y: current.end },
            border: group.border,
          });
      current = interval;
    }
    output.push(orientation === 'horizontal'
      ? {
          from: { x: current.start, y: group.fixed },
          to: { x: current.end, y: group.fixed },
          border: group.border,
        }
      : {
          from: { x: group.fixed, y: current.start },
          to: { x: group.fixed, y: current.end },
          border: group.border,
        });
  }
  return output;
}

function mergeCollinearLines(lines: TableLayoutLine[]): TableLayoutLine[] {
  const horizontal = new Map<string, LineGroup>();
  const vertical = new Map<string, LineGroup>();
  for (const line of lines) {
    const isHorizontal = Math.abs(line.from.y - line.to.y) <= LINE_MERGE_EPSILON;
    const groups = isHorizontal ? horizontal : vertical;
    const fixed = isHorizontal ? line.from.y : line.from.x;
    const first = isHorizontal ? line.from.x : line.from.y;
    const second = isHorizontal ? line.to.x : line.to.y;
    const borderKey = line.border
      ? `${line.border.width}:${line.border.color}:${line.border.style}`
      : 'table';
    const key = `${fixed.toFixed(6)}:${borderKey}`;
    const group = groups.get(key) ?? { fixed, intervals: [], border: line.border };
    group.intervals.push({ start: Math.min(first, second), end: Math.max(first, second) });
    groups.set(key, group);
  }
  return [
    ...mergeLineGroups(horizontal, 'horizontal'),
    ...mergeLineGroups(vertical, 'vertical'),
  ];
}

function insetClippedOuterLines(
  lines: TableLayoutLine[],
  tableWidth: number,
  tableHeight: number,
  tableBorder: BorderStyle,
): TableLayoutLine[] {
  return lines.map(line => {
    const horizontal = Math.abs(line.from.y - line.to.y) <= LINE_MERGE_EPSILON;
    const border = line.border ?? tableBorder;
    // SVG and PDF strokes are centered on their coordinates. Table nodes are
    // clipped to their box, so an outer stroke must move inward by half its
    // width to keep the same visible weight as internal lines.
    const halfWidth = pdfPtToMm(border.width) / 2;
    if (horizontal) {
      const inset = Math.min(halfWidth, tableHeight / 2);
      const y = Math.abs(line.from.y) <= LINE_MERGE_EPSILON
        ? inset
        : Math.abs(line.from.y - tableHeight) <= LINE_MERGE_EPSILON
          ? tableHeight - inset
          : line.from.y;
      return {
        ...line,
        from: { ...line.from, y },
        to: { ...line.to, y },
      };
    }

    const inset = Math.min(halfWidth, tableWidth / 2);
    const x = Math.abs(line.from.x) <= LINE_MERGE_EPSILON
      ? inset
      : Math.abs(line.from.x - tableWidth) <= LINE_MERGE_EPSILON
        ? tableWidth - inset
        : line.from.x;
    return {
      ...line,
      from: { ...line.from, x },
      to: { ...line.to, x },
    };
  });
}

function addTableFooterLines(
  footerCells: TableLayoutCell[],
  edges: TableFooterBorderEdge[],
  border: BorderStyle,
  lines: TableLayoutLine[],
): void {
  if (footerCells.length === 0 || edges.length === 0) return;
  const selected = new Set(edges);
  const minX = Math.min(...footerCells.map(cell => cell.box.x));
  const maxX = Math.max(...footerCells.map(cell => cell.box.x + cell.box.width));
  const minY = Math.min(...footerCells.map(cell => cell.box.y));
  const maxY = Math.max(...footerCells.map(cell => cell.box.y + cell.box.height));
  if (selected.has('top')) {
    lines.push({
      from: { x: minX, y: minY },
      to: { x: maxX, y: minY },
      border,
    });
  }
  if (selected.has('bottom')) {
    lines.push({ from: { x: minX, y: maxY }, to: { x: maxX, y: maxY }, border });
  }
  if (selected.has('left')) {
    lines.push({ from: { x: minX, y: minY }, to: { x: minX, y: maxY }, border });
  }
  if (selected.has('right')) {
    lines.push({ from: { x: maxX, y: minY }, to: { x: maxX, y: maxY }, border });
  }
  for (const cell of footerCells) {
    const { x, y, width, height } = cell.box;
    if (selected.has('horizontal')) {
      if (y > minY + LINE_MERGE_EPSILON) {
        lines.push({ from: { x, y }, to: { x: x + width, y }, border });
      }
      if (y + height < maxY - LINE_MERGE_EPSILON) {
        lines.push({
          from: { x, y: y + height },
          to: { x: x + width, y: y + height },
          border,
        });
      }
    }
    if (selected.has('vertical')) {
      if (x > minX + LINE_MERGE_EPSILON) {
        lines.push({ from: { x, y }, to: { x, y: y + height }, border });
      }
      if (x + width < maxX - LINE_MERGE_EPSILON) {
        lines.push({
          from: { x: x + width, y },
          to: { x: x + width, y: y + height },
          border,
        });
      }
    }
  }
}

function removeSharedFooterBoundary(
  lines: TableLayoutLine[],
  footerStartY: number,
  replaceMinX: number,
  replaceMaxX: number,
): TableLayoutLine[] {
  return lines.flatMap(line => {
    const horizontal = Math.abs(line.from.y - line.to.y) <= LINE_MERGE_EPSILON;
    const onFooterBoundary = horizontal
      && Math.abs(line.from.y - footerStartY) <= LINE_MERGE_EPSILON;
    if (!onFooterBoundary) return [line];

    const lineMinX = Math.min(line.from.x, line.to.x);
    const lineMaxX = Math.max(line.from.x, line.to.x);
    const overlapMinX = Math.max(lineMinX, replaceMinX);
    const overlapMaxX = Math.min(lineMaxX, replaceMaxX);
    if (overlapMaxX <= overlapMinX + LINE_MERGE_EPSILON) return [line];

    const remaining: TableLayoutLine[] = [];
    if (lineMinX < overlapMinX - LINE_MERGE_EPSILON) {
      remaining.push({
        ...line,
        from: { x: lineMinX, y: footerStartY },
        to: { x: overlapMinX, y: footerStartY },
      });
    }
    if (overlapMaxX < lineMaxX - LINE_MERGE_EPSILON) {
      remaining.push({
        ...line,
        from: { x: overlapMaxX, y: footerStartY },
        to: { x: lineMaxX, y: footerStartY },
      });
    }
    return remaining;
  });
}

function footerBoxes(
  footer: TableNode['computedFooters'][number],
  columns: TableColumn[],
  xPositions: number[],
  widths: number[],
  tableWidth: number,
): { label: { x: number; width: number }; value: { x: number; width: number } } {
  if (columns.length <= 1) {
    const labelWidth = tableWidth * 0.6;
    return {
      label: { x: 0, width: labelWidth },
      value: { x: labelWidth, width: tableWidth - labelWidth },
    };
  }

  const configuredValueIndex = footer.valueColumnKey
    ? columns.findIndex(column => column.key === footer.valueColumnKey)
    : columns.length - 1;
  const valueIndex = configuredValueIndex > 0 ? configuredValueIndex : columns.length - 1;
  const configuredStartIndex = footer.startColumnKey
    ? columns.findIndex(column => column.key === footer.startColumnKey)
    : 0;
  const startIndex = configuredStartIndex >= 0 && configuredStartIndex < valueIndex
    ? configuredStartIndex
    : Math.max(0, valueIndex - 1);
  const labelX = xPositions[startIndex];
  const valueX = xPositions[valueIndex];

  return {
    label: { x: labelX, width: valueX - labelX },
    value: { x: valueX, width: widths[valueIndex] },
  };
}

function footerBandBoxes(
  weights: number[],
  startIndex: number,
  xPositions: number[],
  tableWidth: number,
): Array<{ x: number; width: number }> {
  if (weights.length === 0) return [];
  const startX = xPositions[startIndex] ?? 0;
  const availableWidth = tableWidth - startX;
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let x = startX;
  return weights.map(weight => {
    const width = totalWeight > 0 ? availableWidth * weight / totalWeight : 0;
    const box = { x, width };
    x += width;
    return box;
  });
}

export function layoutTablePresentation(
  node: TableNode,
  fontManager: FontManager,
  format: FormatLocaleSettings,
): TableNode {
  const fontName = fontManager.getDefaultFontName();
  const cellPadding = node.style.cellPadding ?? DEFAULT_TABLE_CELL_PADDING_MM;
  const headerBold = node.style.headerBold ?? true;
  const { widths, xPositions } = columnGeometry(node);

  const cells: TableLayoutCell[] = [];
  const lines: TableLayoutLine[] = [];
  let y = 0;

  node.columns.forEach((column, columnIndex) => {
    cells.push(createCell({
      id: `${node.id}:header:${column.id}`,
      role: 'header',
      x: xPositions[columnIndex],
      y,
      width: widths[columnIndex],
      height: node.style.headerHeight,
      text: column.label,
      align: resolveHeaderAlign(column),
      color: node.style.headerColor,
      backgroundColor: node.style.headerBackground,
      bold: headerBold,
      fontManager,
      fontName,
      fontSize: node.style.fontSize,
      padding: cellPadding,
      column,
    }));
  });
  y += node.style.headerHeight;

  const rowStart = node.fragment?.rowStart ?? 0;
  const rowEnd = node.fragment?.rowEnd ?? node.computedRows.length;
  for (let rowIndex = rowStart; rowIndex < rowEnd; rowIndex++) {
    const row = node.computedRows[rowIndex];
    const rowHeight = node.rowHeights?.[rowIndex] ?? node.style.rowHeight;
    node.columns.forEach((column, columnIndex) => {
      const { text, prefixText, error } = displayValue(row[column.key], column, format);
      cells.push(createCell({
        id: `${node.id}:body:${row.id}:${column.id}`,
        role: 'body',
        x: xPositions[columnIndex],
        y,
        width: widths[columnIndex],
        height: rowHeight,
        text,
        prefixText,
        backgroundColor: error ? FORMULA_ERROR_BACKGROUND : undefined,
        align: column.align,
        color: node.style.bodyColor,
        bold: false,
        fontManager,
        fontName,
        fontSize: node.style.fontSize,
        padding: cellPadding,
        rowIndex,
        column,
        wrap: column.valueType === 'text',
      }));
    });
    y += rowHeight;
  }

  const fillRows = node.fragment?.fillRows ?? 0;
  for (let fill = 0; fill < fillRows; fill++) {
    node.columns.forEach((column, columnIndex) => {
      cells.push(createCell({
        id: `${node.id}:fill:${fill}:${column.id}`,
        role: 'body',
        x: xPositions[columnIndex],
        y,
        width: widths[columnIndex],
        height: node.style.rowHeight,
        text: '',
        align: column.align,
        color: node.style.bodyColor,
        bold: false,
        fontManager,
        fontName,
        fontSize: node.style.fontSize,
        padding: cellPadding,
        column,
      }));
    });
    y += node.style.rowHeight;
  }

  const includeFooter = (node.fragment?.includeFooter ?? true) && node.showInlineFooter !== false;
  const footerStartY = y;
  if (includeFooter) {
    const footerStyle = node.footerStyle;
    const footerBackground = footerStyle?.background;
    const footerColor = footerStyle?.color ?? node.style.bodyColor;
    const footerLabelBackground = footerBackground ?? node.style.headerBackground;
    const footerLabelColor = footerStyle?.color ?? node.style.headerColor;
    if (node.footerBand?.enabled) {
      const band = node.footerBand;
      const visibleItems = band.items.flatMap(item => {
        const footer = node.computedFooters.find(candidate => candidate.id === item.footerId);
        return footer ? [{ item, footer }] : [];
      });
      const configuredStartIndex = band.startColumnKey
        ? node.columns.findIndex(column => column.key === band.startColumnKey)
        : 0;
      const startIndex = Math.max(0, Math.min(configuredStartIndex, node.columns.length - 1));
      const bandBoxes = footerBandBoxes(
        [band.leadWidth, ...visibleItems.map(entry => entry.item.width)],
        startIndex,
        xPositions,
        node.box.width,
      );
      const leadBox = bandBoxes[0] ?? { x: xPositions[startIndex] ?? 0, width: 0 };
      const bandHeight = band.headerHeight + band.valueHeight;
      cells.push(createCell({
        id: `${node.id}:footer-band-label`,
        role: 'footer-label',
        x: leadBox.x,
        y,
        width: leadBox.width,
        height: bandHeight,
        text: band.label,
        align: 'center',
        color: footerLabelColor,
        backgroundColor: footerLabelBackground,
        bold: true,
        fontManager,
        fontName,
        fontSize: node.style.fontSize,
        padding: cellPadding,
      }));
      for (const [{ footer }, box] of visibleItems.map((entry, index) => [entry, bandBoxes[index + 1]] as const)) {
        if (!box) continue;
        const fontSize = footer.fontSize ?? node.style.fontSize;
        cells.push(createCell({
          id: `${node.id}:footer-band-header:${footer.id}`,
          role: 'footer-label',
          x: box.x,
          y,
          width: box.width,
          height: band.headerHeight,
          text: footer.label,
          align: 'left',
          color: footerColor,
          backgroundColor: footerBackground,
          bold: footer.bold,
          fontManager,
          fontName,
          fontSize,
          padding: cellPadding,
        }));
        cells.push(createCell({
          id: `${node.id}:footer-band-value:${footer.id}`,
          role: 'footer-value',
          x: box.x,
          y: y + band.headerHeight,
          width: box.width,
          height: band.valueHeight,
          ...formatNumericPresentation(footer.value, footer.numericFormat, footer.decimalPlaces ?? 0, format),
          align: 'right',
          color: node.style.bodyColor,
          bold: footer.bold,
          fontManager,
          fontName,
          fontSize,
          padding: cellPadding,
        }));
      }
      y += bandHeight;
    } else for (const footer of node.computedFooters) {
      const boxes = footerBoxes(footer, node.columns, xPositions, widths, node.box.width);
      const fontSize = footer.fontSize ?? node.style.fontSize;
      cells.push(createCell({
        id: `${node.id}:footer-label:${footer.id}`,
        role: 'footer-label',
        x: boxes.label.x,
        y,
        width: boxes.label.width,
        height: node.style.rowHeight,
        text: footer.label,
        align: 'right',
        color: footerColor,
        backgroundColor: footerBackground,
        bold: footer.bold,
        fontManager,
        fontName,
        fontSize,
        padding: cellPadding,
      }));
      cells.push(createCell({
        id: `${node.id}:footer-value:${footer.id}`,
        role: 'footer-value',
        x: boxes.value.x,
        y,
        width: boxes.value.width,
        height: node.style.rowHeight,
        ...formatNumericPresentation(footer.value, footer.numericFormat, footer.decimalPlaces ?? 0, format),
        align: 'right',
        color: node.style.bodyColor,
        bold: footer.bold,
        fontManager,
        fontName,
        fontSize,
        padding: cellPadding,
      }));
      y += node.style.rowHeight;
    }
  }

  const footerCells = cells.filter(cell =>
    cell.role === 'footer-label' || cell.role === 'footer-value'
  );
  const footerStyle = node.footerStyle;
  const customFooterBorder = footerCells.length > 0
    && footerStyle
    && footerStyle.borderPreset !== 'inherit';
  for (const cell of cells) {
    if (!customFooterBorder || (cell.role !== 'footer-label' && cell.role !== 'footer-value')) {
      addCellLines(cell, lines);
    }
  }
  if (customFooterBorder && footerStyle) {
    const footerEdges = resolveTableFooterBorderEdges(footerStyle);
    const footerMinX = Math.min(...footerCells.map(cell => cell.box.x));
    const footerMaxX = Math.max(...footerCells.map(cell => cell.box.x + cell.box.width));
    const bodyLines = removeSharedFooterBoundary(
      lines,
      footerStartY,
      footerMinX,
      footerMaxX,
    );
    lines.length = 0;
    lines.push(...bodyLines);
    addTableFooterLines(
      footerCells,
      footerEdges,
      footerStyle.border,
      lines,
    );
  } else {
    lines.push(
      { from: { x: 0, y: 0 }, to: { x: node.box.width, y: 0 } },
      { from: { x: node.box.width, y: 0 }, to: { x: node.box.width, y } },
      { from: { x: node.box.width, y }, to: { x: 0, y } },
      { from: { x: 0, y }, to: { x: 0, y: 0 } },
    );
  }
  const mergedLines = mergeCollinearLines(lines);
  return {
    ...node,
    box: { ...node.box, height: y },
    layout: {
      cells,
      lines: insetClippedOuterLines(mergedLines, node.box.width, y, node.style.border),
      height: y,
    },
  };
}
