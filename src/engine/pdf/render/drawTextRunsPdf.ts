import type { PDFFont, PDFPage } from 'pdf-lib';
import type { PdfFontManager } from '@/engine/pdf/font/fontManager.js';
import type { TextFontRun } from '@/engine/renderTree/model.js';
import { drawTextPdf } from '@/engine/pdf/render/drawTextPdf.js';

type DrawTextOptions = NonNullable<Parameters<PDFPage['drawText']>[1]> & { x: number };

export interface DrawTextRunsOptions extends Omit<DrawTextOptions, 'x' | 'font' | 'size'> {
  x: number;
  size: number;
  fontManager: PdfFontManager;
  pdfDoc: unknown;
  bold?: boolean;
}

/**
 * Draws a line made of font runs at one baseline. Each run is embedded with
 * its own face and advances by the width that face measured in layout, so the
 * PDF matches the line box the DOM preview received.
 */
export async function drawTextRunsPdf(
  page: PDFPage,
  runs: readonly TextFontRun[],
  options: DrawTextRunsOptions,
): Promise<void> {
  let x = options.x;
  for (const run of runs) {
    if (!run.text) continue;
    const font = await options.fontManager.embedPdfFont(options.pdfDoc, run.fontName) as PDFFont;
    drawTextPdf(page, run.text, {
      x,
      y: options.y,
      size: options.size,
      color: options.color,
      opacity: options.opacity,
      font,
    }, options.bold);
    x += options.fontManager.measureText(run.fontName, run.text, options.size);
  }
}
