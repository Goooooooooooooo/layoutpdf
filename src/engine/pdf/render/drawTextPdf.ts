import type { PDFPage } from 'pdf-lib';
import { SYNTHETIC_BOLD_OFFSET_PT } from '@/engine/renderTree/textWeight.js';

type DrawTextOptions = NonNullable<Parameters<PDFPage['drawText']>[1]> & { x: number };

export function drawTextPdf(
  page: PDFPage,
  text: string,
  options: DrawTextOptions,
  bold = false,
): void {
  page.drawText(text, options);
  if (!bold) return;
  page.drawText(text, {
    ...options,
    x: options.x + SYNTHETIC_BOLD_OFFSET_PT,
  });
}

