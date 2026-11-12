import { rgb, type PDFFont } from 'pdf-lib';
import { hex2Rgb } from '@/engine/utils/color.js';
import { mmToPdfPt } from '@/engine/utils/units.js';
import type { TableNode } from '@/engine/renderTree/model.js';
import type { PdfNodeRenderContext } from '@/engine/pdf/render/types.js';
import { drawTextPdf } from '@/engine/pdf/render/drawTextPdf.js';

function dashArray(style: TableNode['style']['border']['style']): number[] | undefined {
  if (style === 'dashed') return [4, 3];
  if (style === 'dotted') return [1, 2];
  return undefined;
}

export async function renderTablePdf(
  node: TableNode,
  context: PdfNodeRenderContext,
): Promise<void> {
  if (node.layout.cells.length === 0) {
    throw new Error('Table node has no shared layout cells.');
  }
  const pageHeight = context.page.getHeight();

  for (const cell of node.layout.cells) {
    if (cell.backgroundColor) {
      const background = hex2Rgb(cell.backgroundColor);
      context.page.drawRectangle({
        x: mmToPdfPt(node.box.x + cell.box.x),
        y: pageHeight - mmToPdfPt(node.box.y + cell.box.y + cell.box.height),
        width: mmToPdfPt(cell.box.width),
        height: mmToPdfPt(cell.box.height),
        color: rgb(background.r, background.g, background.b),
        opacity: node.opacity,
      });
    }
    const textLines = cell.lines ?? (cell.text ? [{
      text: cell.text,
      x: cell.textX,
      y: cell.textY,
      width: cell.textWidth,
    }] : []);
    for (const line of textLines) {
      if (!line.text) continue;
      const fontName = cell.fontName || context.fontManager.getDefaultFontName();
      const font = await context.fontManager.embedPdfFont(context.pdfDoc, fontName) as PDFFont;
      const color = hex2Rgb(cell.color);
      drawTextPdf(context.page, line.text, {
        x: mmToPdfPt(node.box.x + line.x),
        y: pageHeight - mmToPdfPt(node.box.y + line.y) - cell.fontSize,
        size: cell.fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity: node.opacity,
      }, cell.bold && (cell.syntheticBold ?? true));
    }
    if (cell.prefixText && cell.prefixTextX !== undefined) {
      const fontName = cell.fontName || context.fontManager.getDefaultFontName();
      const font = await context.fontManager.embedPdfFont(context.pdfDoc, fontName) as PDFFont;
      const color = hex2Rgb(cell.color);
      drawTextPdf(context.page, cell.prefixText, {
        x: mmToPdfPt(node.box.x + cell.prefixTextX),
        y: pageHeight - mmToPdfPt(node.box.y + cell.textY) - cell.fontSize,
        size: cell.fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity: node.opacity,
      }, cell.bold && (cell.syntheticBold ?? true));
    }
  }

  for (const line of node.layout.lines) {
    const border = line.border ?? node.style.border;
    const borderColor = hex2Rgb(border.color);
    context.page.drawLine({
      start: {
        x: mmToPdfPt(node.box.x + line.from.x),
        y: pageHeight - mmToPdfPt(node.box.y + line.from.y),
      },
      end: {
        x: mmToPdfPt(node.box.x + line.to.x),
        y: pageHeight - mmToPdfPt(node.box.y + line.to.y),
      },
      thickness: border.width,
      color: rgb(borderColor.r, borderColor.g, borderColor.b),
      dashArray: dashArray(border.style),
      opacity: node.opacity,
    });
  }
}
