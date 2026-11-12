import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TemplateFile } from '@/engine/core/document.js';
import type { PdfFontManager } from '@/engine/pdf/font/fontManager.js';
import type { RenderDocument } from '@/engine/renderTree/model.js';
import {
  renderDocumentPdfInWorker,
  terminateWorker,
} from '@/engine/pdf/render/pdfExportWorkerClient.js';

interface PostedMessage {
  fontEntries: Record<string, { bytes: Uint8Array }>;
  document: RenderDocument;
  subsetter?: boolean;
  pageRange?: readonly [number, number];
  strict?: boolean;
}

class FakeWorker {
  readonly listeners = new Set<(event: MessageEvent) => void>();
  lastMessage?: PostedMessage;
  lastTransfer?: ArrayBuffer[];
  terminated = false;

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === 'message') this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === 'message') this.listeners.delete(listener);
  }

  postMessage(message: PostedMessage, transfer?: ArrayBuffer[]): void {
    this.lastMessage = message;
    this.lastTransfer = transfer;
    queueMicrotask(() => {
      const data = { bytes: new Uint8Array([1, 2, 3]) };
      for (const listener of this.listeners) {
        listener({ data } as MessageEvent);
      }
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

const document: RenderDocument = {
  templateId: 'template',
  format: {
    locale: 'en-US',
    currency: 'USD',
    calendar: 'gregory',
    timeZone: 'America/New_York',
  },
  pages: [],
  issues: [],
};

const file = { template: { pages: [] }, assets: {} } as unknown as TemplateFile;

const fontManager: PdfFontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array([7, 7, 7]),
  assertTextSupported: () => {},
  measureText: () => 0,
  ensureBrowserFont: async () => 'default',
  embedPdfFont: async () => undefined,
  replaceFontBytes: () => {},
};

describe('PDF worker client', () => {
  it('posts the document, font bytes, and subsetter flag', async () => {
    const fake = new FakeWorker();
    try {
      const bytes = await renderDocumentPdfInWorker(
        {
          document,
          file,
          fontManager,
          subsetter: true,
          pageRange: [1, 1],
          strict: true,
        },
        () => fake as unknown as Worker,
      );

      assert.deepEqual([...bytes], [1, 2, 3]);
      assert.equal(fake.lastMessage?.document, document);
      assert.deepEqual([...fake.lastMessage!.fontEntries.default.bytes], [7, 7, 7]);
      assert.equal(fake.lastMessage?.subsetter, true);
      assert.deepEqual(fake.lastMessage?.pageRange, [1, 1]);
      assert.equal(fake.lastMessage?.strict, true);
      assert.equal(fake.lastTransfer?.length, 1);
    } finally {
      terminateWorker();
    }
  });
});
