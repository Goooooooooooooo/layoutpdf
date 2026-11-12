import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { createBlankTemplateFile, type IdPrefix } from './document.js';
import { createFontManager } from '../pdf/font/fontManager.js';
import { layoutRenderTree } from '../renderTree/layout.js';
import { renderDocumentPdf } from '../pdf/render/renderDocumentPdf.js';
import { resolveRenderTree } from '../renderTree/resolve.js';
import { pluginRegistry } from '../../plugins/index.js';
import { invoicePreset } from '../../presets/invoice.js';
import { createPdfFontFromBytes } from '../../fonts.js';

describe('Template + Input + Plugin end-to-end workflow', () => {
  it('exports a newly added default label with the bundled Japanese font', async () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_label` });
    const label = pluginRegistry.require('label').createDefaultElement({
      id: 'el_label',
      position: { x: 10, y: 10 },
    });
    label.value = '标签 金額 計算 請求書';
    file.template.pages[0].elements.push(label);
    const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));
    const fontManager = createFontManager(createPdfFontFromBytes(fontBytes, 'Bundled CJK'));
    const document = layoutRenderTree(resolveRenderTree({
      file,
      input: {},
      plugins: pluginRegistry,
      fontManager,
    }), { fontManager });

    assert.deepEqual(document.issues.filter(issue => issue.severity === 'error'), []);
    const bytes = await renderDocumentPdf({ document, file, fontManager });
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.ok(bytes.length > 1000);
  });

  it('builds a paginated Japanese invoice and reopens the generated PDF', async () => {
    let id = 0;
    const idGenerator = (prefix: IdPrefix) => `${prefix}_${id++}`;
    const file = createBlankTemplateFile({ idGenerator, name: '請求書' });
    file.template.pages[0].elements.push(...invoicePreset.createElements({
      pageId: file.template.pages[0].id,
      origin: { x: 15, y: 10 },
      registry: pluginRegistry,
      createId: idGenerator,
    }));

    const items = Array.from({ length: 30 }, (_, index) => ({
      id: `row_${index + 1}`,
      item: `作業項目 ${index + 1}`,
      quantity: index % 3 + 1,
      unitPrice: 1000 + index * 100,
    }));
    const input = {
      invoiceNumber: 'INV-2026-0713',
      issueDate: '2026-07-13',
      customerName: '株式会社サンプル 御中',
      issuerInfo: '株式会社 LayoutPDF\n架空県サンプル市文書町 1-2-3',
      bankInfo: '〇〇銀行 本店\n普通 1234567',
      note: 'お支払期限: 2026-08-31',
      items,
    };
    const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));
    const fontManager = createFontManager({
      NotoCJK: { data: fontBytes, fallback: true },
    });

    const logical = resolveRenderTree({ file, input, plugins: pluginRegistry, fontManager });
    const document = layoutRenderTree(logical, { fontManager });
    assert.deepEqual(document.issues.filter(issue => issue.severity === 'error'), []);
    assert.ok(document.pages.length > 1);
    const tableFragments = document.pages.flatMap(page =>
      page.nodes.filter(node => node.kind === 'table')
    );
    assert.ok(tableFragments.length > 1);
    assert.equal(tableFragments.at(-1)?.kind === 'table' && tableFragments.at(-1)?.fragment?.includeFooter, true);

    const bytes = await renderDocumentPdf({ document, file, fontManager });
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), document.pages.length);
    assert.equal(pdf.getTitle(), '請求書');
    assert.ok(bytes.length > 10_000_000);
  });
});
