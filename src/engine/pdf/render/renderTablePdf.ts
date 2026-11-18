import { rgb, type PDFFont } from 'pdf-lib';
import { hex2Rgb } from '@/engine/utils/color.js';
import { mmToPdfPt } from '@/engine/utils/units.js';
import type { TableNode, TextLayoutLine } from '@/engine/renderTree/model.js';
import type { PdfNodeRenderContext } from '@/engine/pdf/render/types.js';
import { drawTextPdf } from '@/engine/pdf/render/drawTextPdf.js';
import { drawTextRunsPdf } from '@/engine/pdf/render/drawTextRunsPdf.js';
import { textBaselineFromLineTopPt } from '@/engine/renderTree/textBaseline.js';

function dashArray(style: TableNode['style']['border']['style'], width: number): number[] | undefined {
  if (!(width > 0)) return undefined;
  if (style === 'dashed') return [4 * width, 3 * width];
  if (style === 'dotted') return [width, 2 * width];
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
    const textLines: TextLayoutLine[] = cell.lines ?? (cell.text ? [{
      text: cell.text,
      x: cell.textX,
      y: cell.textY,
      width: cell.textWidth,
    }] : []);
    const fontName = cell.fontName || context.fontManager.getDefaultFontName();
    const baselineOffset = textBaselineFromLineTopPt(
      cell.fontSize,
      cell.lineHeightMm,
      context.fontManager.getFontMetrics?.(fontName),
    );
    const color = hex2Rgb(cell.color);
    const fill = rgb(color.r, color.g, color.b);
    const bold = cell.bold && (cell.syntheticBold ?? true);
    for (const line of textLines) {
      if (!line.text) continue;
      const x = mmToPdfPt(node.box.x + line.x);
      const y = pageHeight - mmToPdfPt(node.box.y + line.y) - baselineOffset;
      const runs = line.runs ?? (cell.lines ? undefined : cell.textRuns);
      if (runs) {
        await drawTextRunsPdf(context.page, runs, {
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
    if (cell.prefixText && cell.prefixTextX !== undefined) {
      const x = mmToPdfPt(node.box.x + cell.prefixTextX);
      const y = pageHeight - mmToPdfPt(node.box.y + cell.textY) - baselineOffset;
      if (cell.prefixTextRuns) {
        await drawTextRunsPdf(context.page, cell.prefixTextRuns, {
          x, y,
          size: cell.fontSize,
          color: fill,
          opacity: node.opacity,
          fontManager: context.fontManager,
          pdfDoc: context.pdfDoc,
          bold,
        });
      } else {
        const font = await context.fontManager.embedPdfFont(context.pdfDoc, fontName) as PDFFont;
        drawTextPdf(context.page, cell.prefixText, {
          x, y,
          size: cell.fontSize,
          font,
          color: fill,
          opacity: node.opacity,
        }, bold);
      }
    }
  }

  for (const line of node.layout.lines) {
    const border = line.border ?? node.style.border;
    if (!(border.width > 0)) continue;
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
      dashArray: dashArray(border.style, border.width),
      opacity: node.opacity,
    });
  }
}
