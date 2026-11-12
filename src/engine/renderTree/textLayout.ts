import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import { resolveFontFace } from '@/engine/pdf/font/fontManager.js';
import { pdfPtToMm } from '@/engine/utils/units.js';
import type { TextLayout, TextLayoutLine, TextNode } from '@/engine/renderTree/model.js';

export interface MeasuredLine {
  text: string;
  width: number;
}

// Shared font metrics and backend coordinate rounding can differ by a few hundredths
// of a millimeter. Treat that sub-visual delta as an exact fit instead of reporting
// a warning for text that remains visibly inside its element.
const TEXT_OVERFLOW_TOLERANCE_MM = 0.05;

function measureMm(
  fontManager: FontManager,
  fontName: string,
  text: string,
  fontSize: number,
): number {
  return pdfPtToMm(fontManager.measureText(fontName, text, fontSize));
}

function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  fontManager: FontManager,
  fontName: string,
  fontSize: number,
): MeasuredLine[] {
  if (paragraph === '') return [{ text: '', width: 0 }];

  const lines: MeasuredLine[] = [];
  const chars = Array.from(paragraph);
  let start = 0;

  while (start < chars.length) {
    let low = start + 1;
    let high = chars.length;
    let end = start;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = chars.slice(start, middle).join('');
      const width = measureMm(fontManager, fontName, candidate, fontSize);
      if (width <= maxWidth) {
        end = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    if (end === start) end = start + 1;
    const text = chars.slice(start, end).join('');
    lines.push({ text, width: measureMm(fontManager, fontName, text, fontSize) });
    start = end;
  }
  return lines;
}

/**
 * Measure final visual lines with the same font and Unicode-safe wrapping used by
 * standalone text nodes. Table measurement calls this before pagination so row
 * allocation and backend drawing consume one authoritative set of line breaks.
 */
export function wrapMeasuredText(
  text: string,
  maxWidth: number,
  fontManager: FontManager,
  fontName: string,
  fontSize: number,
): MeasuredLine[] {
  fontManager.assertTextSupported(fontName, text);
  return text
    .split(/\r?\n/)
    .flatMap(paragraph => wrapParagraph(
      paragraph,
      Math.max(0, maxWidth),
      fontManager,
      fontName,
      fontSize,
    ));
}

function resolveLineX(
  align: TextNode['style']['align'],
  paddingLeft: number,
  contentWidth: number,
  lineWidth: number,
): number {
  if (align === 'center') return paddingLeft + Math.max(0, (contentWidth - lineWidth) / 2);
  if (align === 'right') return paddingLeft + Math.max(0, contentWidth - lineWidth);
  return paddingLeft;
}

function resolveBlockY(
  verticalAlign: TextNode['style']['verticalAlign'],
  paddingTop: number,
  contentHeight: number,
  textHeight: number,
): number {
  const availableOffset = Math.max(0, contentHeight - textHeight);
  if (verticalAlign === 'middle') return paddingTop + availableOffset / 2;
  if (verticalAlign === 'bottom') return paddingTop + availableOffset;
  return paddingTop;
}

export function createTextLayout(node: TextNode, fontManager: FontManager): TextLayout {
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = node.style.padding;
  const contentWidth = Math.max(0, node.box.width - paddingLeft - paddingRight);
  const contentHeight = Math.max(0, node.box.height - paddingTop - paddingBottom);
  const requestedFontName = node.style.fontName || fontManager.getDefaultFontName();
  const fontName = resolveFontFace(fontManager, requestedFontName, node.style.fontWeight).name;
  const lineHeightMm = pdfPtToMm(node.style.fontSize * node.style.lineHeight);

  const measuredLines = wrapMeasuredText(
    node.text,
    contentWidth,
    fontManager,
    fontName,
    node.style.fontSize,
  );

  const textHeight = measuredLines.length * lineHeightMm;
  const blockY = resolveBlockY(
    node.style.verticalAlign,
    paddingTop,
    contentHeight,
    textHeight,
  );

  const lines: TextLayoutLine[] = measuredLines.map((line, index) => ({
    text: line.text,
    x: resolveLineX(node.style.align, paddingLeft, contentWidth, line.width),
    y: blockY + index * lineHeightMm,
    width: line.width,
  }));

  return {
    lines,
    lineHeightMm,
    overflow:
      paddingLeft + paddingRight >= node.box.width ||
      paddingTop + paddingBottom >= node.box.height ||
      textHeight - contentHeight > TEXT_OVERFLOW_TOLERANCE_MM ||
      measuredLines.some(line => line.width - contentWidth > TEXT_OVERFLOW_TOLERANCE_MM),
  };
}

export function layoutTextNode(node: TextNode, fontManager: FontManager): TextNode {
  const requestedFontName = node.style.fontName || fontManager.getDefaultFontName();
  const face = resolveFontFace(fontManager, requestedFontName, node.style.fontWeight);
  const resolvedNode = {
    ...node,
    style: {
      ...node.style,
      fontName: face.name,
      syntheticBold: face.syntheticBold,
    },
  };
  return { ...resolvedNode, layout: createTextLayout(resolvedNode, fontManager) };
}
