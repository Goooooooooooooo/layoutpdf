import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PDFPage } from 'pdf-lib';
import { SYNTHETIC_BOLD_OFFSET_PT } from '@/engine/renderTree/textWeight.js';
import { drawTextPdf } from '@/engine/pdf/render/drawTextPdf.js';

describe('drawTextPdf', () => {
  it('draws normal text once and synthetic bold text twice with a stable offset', () => {
    const calls: Array<{ text: string; x?: number }> = [];
    const page = {
      drawText(text: string, options: { x?: number }) {
        calls.push({ text, x: options.x });
      },
    } as unknown as PDFPage;

    drawTextPdf(page, 'normal', { x: 10, y: 20 }, false);
    drawTextPdf(page, 'bold', { x: 30, y: 40 }, true);

    assert.deepEqual(calls, [
      { text: 'normal', x: 10 },
      { text: 'bold', x: 30 },
      { text: 'bold', x: 30 + SYNTHETIC_BOLD_OFFSET_PT },
    ]);
  });
});

