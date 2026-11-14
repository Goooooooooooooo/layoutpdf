import { rgb, type PDFFont } from 'pdf-lib';
import { hex2Rgb } from '@/engine/utils/color.js';
import { mmToPdfPt } from '@/engine/utils/units.js';
import type { TextNode } from '@/engine/renderTree/model.js';
import type { PdfNodeRenderContext } from '@/engine/pdf/render/types.js';
import { drawTextPdf } from '@/engine/pdf/render/drawTextPdf.js';
import { textBaselineFromLineTopPt } from '@/engine/renderTree/textBaseline.js';

function dashArray(style: 'solid' | 'dashed' | 'dotted'): number[] | undefined {
  if (style === 'dashed') return [4, 3];
  if (style === 'dotted') return [1, 2];
  return undefined;
}

export async function renderTextPdf(
  node: TextNode,
  context: PdfNodeRenderContext,
): Promise<void> {
  const { page, fontManager, pdfDoc } = context;
  const pageHeight = page.getHeight();
  const fontName = node.style.fontName || fontManager.getDefaultFontName();
  const font = await fontManager.embedPdfFont(pdfDoc, fontName) as PDFFont;
  const baselineOffset = textBaselineFromLineTopPt(
    node.style.fontSize,
    node.layout.lineHeightMm,
    fontManager.getFontMetrics?.(fontName),
  );

  const border = node.style.border;
  const hasVisibleBorder = border && border.width > 0;
  if (node.style.backgroundColor || hasVisibleBorder) {
    const options: Parameters<typeof page.drawRectangle>[0] = {
      x: mmToPdfPt(node.box.x),
      y: pageHeight - mmToPdfPt(node.box.y + node.box.height),
      width: mmToPdfPt(node.box.width),
      height: mmToPdfPt(node.box.height),
      opacity: node.opacity,
    };
    if (node.style.backgroundColor) {
      const fill = hex2Rgb(node.style.backgroundColor);
      options.color = rgb(fill.r, fill.g, fill.b);
    }
    if (hasVisibleBorder) {
      const color = hex2Rgb(border.color);
      options.borderColor = rgb(color.r, color.g, color.b);
      options.borderWidth = border.width;
      options.borderDashArray = dashArray(border.style);
      options.borderOpacity = node.opacity;
    }
    page.drawRectangle(options);
  }

  const color = hex2Rgb(node.style.color);
  for (const line of node.layout.lines) {
    if (!line.text) continue;
    drawTextPdf(page, line.text, {
      x: mmToPdfPt(node.box.x + line.x),
      y: pageHeight - mmToPdfPt(node.box.y + line.y) - baselineOffset,
      size: node.style.fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      opacity: node.opacity,
    }, node.style.fontWeight === 'bold' && (node.style.syntheticBold ?? true));
  }
}
