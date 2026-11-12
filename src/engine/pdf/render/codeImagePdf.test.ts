import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { createBlankTemplateFile } from '@/engine/core/document.js';
import type { RenderBuildContext } from '@/engine/core/plugin.js';
import type { PdfFontManager } from '@/engine/pdf/font/fontManager.js';
import type { RenderDocument } from '@/engine/renderTree/model.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';
import { barcodePlugin } from '@/plugins/barcode/barcode.js';
import { qrcodePlugin } from '@/plugins/qrcode/qrcode.js';
import { renderDocumentPdf } from './renderDocumentPdf.js';

const context: RenderBuildContext = {
  pageId: 'page_1',
  pageSize: { width: 210, height: 297 },
  input: {},
  fontManager: {
    getDefaultFontName: () => 'default',
    getFontBytes: () => new Uint8Array(),
    assertTextSupported: () => undefined,
    measureText: () => 0,
    ensureBrowserFont: async () => 'default',
  },
  format: defaultFormatSettingsForLocale('en-US'),
  createNodeId: localId => `code:${localId}`,
  report: () => undefined,
};

function pngBytes(dataUrl: string): Uint8Array {
  return new Uint8Array(Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

describe('generated code images', () => {
  it('embeds generated QR and Code 128 PNG data in pdf-lib', async () => {
    const qrElement = qrcodePlugin.createDefaultElement({ id: 'qr', position: { x: 0, y: 0 } });
    const barcodeElement = barcodePlugin.createDefaultElement({ id: 'barcode', position: { x: 0, y: 40 } });
    const qrNode = qrcodePlugin.buildRenderNodes({ element: qrElement, value: 'LAYOUTPDF-QR-1001', context })[0];
    const barcodeNode = barcodePlugin.buildRenderNodes({ element: barcodeElement, value: 'LAYOUTPDF-1001', context })[0];
    assert.equal(qrNode.kind, 'image');
    assert.equal(barcodeNode.kind, 'image');

    const pdf = await PDFDocument.create();
    const qrImage = await pdf.embedPng(pngBytes(qrNode.kind === 'image' ? qrNode.dataUrl! : ''));
    const barcodeImage = await pdf.embedPng(pngBytes(barcodeNode.kind === 'image' ? barcodeNode.dataUrl! : ''));
    assert.equal(qrImage.width, qrImage.height);
    assert.ok(barcodeImage.width > barcodeImage.height);

    const document: RenderDocument = {
      templateId: 'template_1',
      format: context.format,
      issues: [],
      pages: [{
        id: 'page_1',
        sourcePageId: 'page_1',
        continuationIndex: 0,
        size: context.pageSize,
        padding: [10, 10, 10, 10],
        background: { kind: 'blank', color: '#ffffff' },
        nodes: [qrNode, barcodeNode],
      }],
    };
    const file = createBlankTemplateFile({
      name: 'Code image PDF',
      idGenerator: prefix => `${prefix}_1`,
    });
    const fontManager = context.fontManager as PdfFontManager;
    const bytes = await renderDocumentPdf({ document, file, fontManager });
    const renderedPdf = await PDFDocument.load(bytes);
    assert.equal(renderedPdf.getPageCount(), 1);
    assert.ok(bytes.length > 1_000);
  });
});
