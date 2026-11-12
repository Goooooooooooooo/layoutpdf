import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import { resolveFontFace } from '@/engine/pdf/font/fontManager.js';
import type {
  ComputedGridCell,
  GridCell,
  GridLayoutCell,
  GridLayoutLine,
  GridNode,
  TextNode,
} from '@/engine/renderTree/model.js';
import { createTextLayout } from '@/engine/renderTree/textLayout.js';

function cumulativePositions(sizes: number[]): number[] {
  const positions: number[] = [];
  let cursor = 0;
  for (const size of sizes) {
    positions.push(cursor);
    cursor += size;
  }
  return positions;
}

function spanSize(sizes: number[], start: number, span: number): number {
  return sizes.slice(start, start + span).reduce((sum, size) => sum + size, 0);
}

function cellBorders(
  cell: GridCell,
  columnIndex: number,
  columnSpan: number,
  columnCount: number,
): GridLayoutCell['borders'] {
  return {
    top: cell.borders?.top ?? true,
    bottom: cell.borders?.bottom ?? true,
    left: cell.borders?.left ?? columnIndex === 0,
    right: cell.borders?.right ?? columnIndex + columnSpan === columnCount,
  };
}

function createCellTextNode(
  node: GridNode,
  cell: ComputedGridCell,
  width: number,
  height: number,
  align = cell.align ?? 'left',
): TextNode {
  const padding = node.style.cellPadding ?? (cell.role === 'header' ? 1.5 : 1);
  return {
    kind: 'text',
    id: `${node.id}:cell-text`,
    sourceElementId: node.sourceElementId,
    box: { x: 0, y: 0, width, height },
    rotate: 0,
    opacity: node.opacity,
    clip: true,
    zIndex: node.zIndex,
    text: cell.content,
    style: {
      fontSize: cell.fontSize ?? node.style.fontSize,
      color: cell.color ?? (cell.role === 'header' ? '#000000' : '#333333'),
      fontWeight: cell.bold ? 'bold' : 'normal',
      align,
      verticalAlign: cell.verticalAlign ?? 'middle',
      lineHeight: 1.2,
      padding: [padding, padding, padding, padding],
    },
    layout: { lines: [], lineHeightMm: 0, overflow: false },
  };
}

function textLayoutsCollide(
  left: TextNode['layout'],
  right: TextNode['layout'],
): boolean {
  return left.lines.some(leftLine => right.lines.some(rightLine => {
    const horizontalOverlap = leftLine.x < rightLine.x + rightLine.width
      && leftLine.x + leftLine.width > rightLine.x;
    const verticalOverlap = leftLine.y < rightLine.y + right.lineHeightMm
      && leftLine.y + left.lineHeightMm > rightLine.y;
    return horizontalOverlap && verticalOverlap;
  }));
}

export function layoutGridPresentation(node: GridNode, fontManager: FontManager): GridNode {
  const totalWeight = node.columns.reduce((sum, column) => sum + column.width, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    throw new Error('Grid column widths must have a positive total.');
  }

  const columnWidths = node.columns.map(column => node.box.width * column.width / totalWeight);
  const rowHeights = node.rows.map((row, index) =>
    row.height ?? (index === 0 ? node.style.headerHeight : node.style.rowHeight));
  const columnPositions = cumulativePositions(columnWidths);
  const rowPositions = cumulativePositions(rowHeights);
  const layoutCells: GridLayoutCell[] = [];
  const layoutLines: GridLayoutLine[] = [];

  for (const [key, cell] of Object.entries(node.computedCells)) {
    const [rawRowIndex, columnKey] = key.split(':');
    const rowIndex = Number(rawRowIndex);
    const columnIndex = node.columns.findIndex(column => column.key === columnKey);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= node.rows.length || columnIndex < 0) {
      continue;
    }

    const columnSpan = cell.columnSpan ?? 1;
    const rowSpan = cell.rowSpan ?? 1;
    if (columnIndex + columnSpan > node.columns.length || rowIndex + rowSpan > node.rows.length) {
      continue;
    }

    const x = columnPositions[columnIndex];
    const y = rowPositions[rowIndex];
    const width = spanSize(columnWidths, columnIndex, columnSpan);
    const height = spanSize(rowHeights, rowIndex, rowSpan);
    const textNode = createCellTextNode(node, cell, width, height);
    const requestedFontName = textNode.style.fontName || fontManager.getDefaultFontName();
    const face = resolveFontFace(fontManager, requestedFontName, textNode.style.fontWeight);
    const textLayout = createTextLayout(textNode, fontManager);
    const prefixNode = cell.prefixText
      ? {
          ...createCellTextNode(node, { ...cell, content: cell.prefixText }, width, height, 'left'),
          text: cell.prefixText,
        }
      : undefined;
    const prefixLayout = prefixNode ? createTextLayout(prefixNode, fontManager) : undefined;
    const borders = cellBorders(cell, columnIndex, columnSpan, node.columns.length);

    layoutCells.push({
      id: `${node.id}:cell:${key}`,
      role: cell.role,
      box: { x, y, width, height },
      lines: textLayout.lines,
      ...(prefixLayout ? { prefixLines: prefixLayout.lines } : {}),
      lineHeightMm: textLayout.lineHeightMm,
      fontSize: textNode.style.fontSize,
      align: textNode.style.align,
      color: textNode.style.color,
      backgroundColor: cell.backgroundColor,
      bold: cell.bold ?? false,
      fontName: face.name,
      syntheticBold: face.syntheticBold,
      overflow: textLayout.overflow
        || Boolean(prefixLayout?.overflow)
        || Boolean(prefixLayout && textLayoutsCollide(prefixLayout, textLayout)),
      borders,
    });

    if (borders.top) layoutLines.push({ from: { x, y }, to: { x: x + width, y } });
    if (borders.bottom) layoutLines.push({ from: { x, y: y + height }, to: { x: x + width, y: y + height } });
    if (borders.left) layoutLines.push({ from: { x, y }, to: { x, y: y + height } });
    if (borders.right) layoutLines.push({ from: { x: x + width, y }, to: { x: x + width, y: y + height } });
  }

  return {
    ...node,
    layout: {
      cells: layoutCells,
      lines: mergeCollinearLines(layoutLines),
      height: rowHeights.reduce((sum, height) => sum + height, 0),
    },
  };
}

function mergeCollinearLines(lines: GridLayoutLine[]): GridLayoutLine[] {
  const normalized = lines.map(line => ({
    from: { ...line.from },
    to: { ...line.to },
  }));
  const horizontal = normalized.filter(line => line.from.y === line.to.y);
  const vertical = normalized.filter(line => line.from.x === line.to.x);

  function merge(group: GridLayoutLine[], isHorizontal: boolean): GridLayoutLine[] {
    const sorted = group.map(line => {
      if (isHorizontal && line.from.x > line.to.x) return { from: line.to, to: line.from };
      if (!isHorizontal && line.from.y > line.to.y) return { from: line.to, to: line.from };
      return line;
    }).sort((a, b) => {
      const axisDelta = isHorizontal ? a.from.y - b.from.y : a.from.x - b.from.x;
      return axisDelta || (isHorizontal ? a.from.x - b.from.x : a.from.y - b.from.y);
    });

    const result: GridLayoutLine[] = [];
    for (const line of sorted) {
      const previous = result[result.length - 1];
      const sameAxis = previous && (isHorizontal
        ? previous.from.y === line.from.y
        : previous.from.x === line.from.x);
      const overlaps = previous && (isHorizontal
        ? previous.to.x >= line.from.x
        : previous.to.y >= line.from.y);
      if (previous && sameAxis && overlaps) {
        if (isHorizontal) previous.to.x = Math.max(previous.to.x, line.to.x);
        else previous.to.y = Math.max(previous.to.y, line.to.y);
      } else {
        result.push({ from: { ...line.from }, to: { ...line.to } });
      }
    }
    return result;
  }

  return [...merge(horizontal, true), ...merge(vertical, false)];
}
