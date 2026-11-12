import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEngine } from '@/engine/createEngine.js';
import type { PdfFontManager } from '@/engine/pdf/font/fontManager.js';

const fontManager: PdfFontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: () => 0,
  ensureBrowserFont: async () => 'default',
  embedPdfFont: async () => undefined,
  replaceFontBytes: () => {},
};

describe('DocumentSession PDF options', () => {
  it('rejects main-thread-only options in worker mode', async () => {
    const engine = createEngine({
      plugins: [],
      fontManager,
      pdfExecutionTarget: 'worker',
      pdfWorkerFactory: () => {
        throw new Error('Worker should not be created.');
      },
    });
    const template = engine.createTemplate({ name: 'Worker options' }).build();

    await assert.rejects(
      () => engine.createDocument(template).generatePdf({
        signal: new AbortController().signal,
      }),
      /onProgress and signal are only supported with pdfExecutionTarget: "main-thread"/,
    );

    await assert.rejects(
      () => engine.createDocument(template).generatePdf({
        onProgress: () => {},
      }),
      /onProgress and signal are only supported with pdfExecutionTarget: "main-thread"/,
    );
  });
});
