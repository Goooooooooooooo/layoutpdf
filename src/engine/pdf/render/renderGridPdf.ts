import { rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import type { GridNode } from '@/engine/renderTree/model.js';
import type { PdfNodeRenderContext } from '@/engine/pdf/render/types.js';
import { hex2Rgb } from '@/engine/utils/color.js';
import { mmToPdfPt } from '@/engine/utils/units.js';
import { drawTextPdf } from '@/engine/pdf/render/drawTextPdf.js';
import { drawTextRunsPdf } from '@/engine/pdf/render/drawTextRunsPdf.js';

function dashArray(style: 'solid' | 'dashed' | 'dotted'): number[] | undefined {
  if (style === 'dashed') return [4, 3];
  if (style === 'dotted') return [1, 2];
  return undefined;
}

export async function renderGridPdf(node: GridNode, context: PdfNodeRenderContext): Promise<void> {
  if (node.layout.cells.length === 0) return;

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
    const fontName = cell.fontName || context.fontManager.getDefaultFontName();
    const color = hex2Rgb(cell.color);
    const fill = rgb(color.r, color.g, color.b);
    const bold = cell.bold && (cell.syntheticBold ?? true);
    for (const line of [...(cell.prefixLines ?? []), ...cell.lines]) {
      if (!line.text) continue;
      const x = mmToPdfPt(node.box.x + cell.box.x + line.x);
      const y = pageHeight - mmToPdfPt(node.box.y + cell.box.y + line.y) - cell.fontSize;
      if (line.runs) {
        await drawTextRunsPdf(context.page, line.runs, {
          x, y,
          size: cell.fontSize,
          color: fill,
          opacity: node.opacity,
          fontManager: context.fontManager,
          pdfDoc: context.pdfDoc,
          bold,
        });
        continue;
      }
      const font = await context.fontManager.embedPdfFont(context.pdfDoc, fontName) as PDFFont;
      drawTextPdf(context.page, line.text, {
        x, y,
        size: cell.fontSize,
        font,
        color: fill,
        opacity: node.opacity,
      }, bold);
    }
  }

  if (node.style.border.width <= 0) return;
  const borderColor = hex2Rgb(node.style.border.color);
  for (const line of node.layout.lines) {
    context.page.drawLine({
      start: {
        x: mmToPdfPt(node.box.x + line.from.x),
        y: pageHeight - mmToPdfPt(node.box.y + line.from.y),
      },
      end: {
        x: mmToPdfPt(node.box.x + line.to.x),
        y: pageHeight - mmToPdfPt(node.box.y + line.to.y),
      },
      thickness: node.style.border.width,
      color: rgb(borderColor.r, borderColor.g, borderColor.b),
      dashArray: dashArray(node.style.border.style),
      opacity: node.opacity,
    });
  }
}
