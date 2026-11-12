import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { describe, it } from 'node:test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  type PDFFont,
} from 'pdf-lib';
import type { TemplateFile } from '../../core/document.js';
import { createBlankTemplateFile } from '../../core/document.js';
import { LayoutPDFValidationError } from '../../utils/errors.js';
import type { PdfFontManager } from '../font/fontManager.js';
import { createFontManager } from '../font/fontManager.js';
import { assertCffCharsetIdentity } from '../font/cffCharset.js';
import { initWithBytes } from '../font/subsetFont.js';
import type {
  EllipseNode,
  GridNode,
  LineNode,
  RectNode,
  RenderDocument,
  RenderNode,
  TableNode,
  TextNode,
} from '../../renderTree/model.js';
import { computeTableNode } from '../../renderTree/tableLayout.js';
import { computeProducerNodes } from '../../renderTree/outputReferences.js';
import { layoutRenderTree } from '../../renderTree/layout.js';
import { layoutGridPresentation } from '../../renderTree/gridPresentation.js';
import { layoutTablePresentation } from '../../renderTree/tablePresentation.js';
import { tablePlugin } from '../../../plugins/table/table.js';
import { renderDocumentPdf, type PdfProgressEvent } from './renderDocumentPdf.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';

const format = defaultFormatSettingsForLocale('ja-JP');

function fontManager(): PdfFontManager {
  const cache = new WeakMap<object, Promise<PDFFont>>();
  return {
    getDefaultFontName: () => 'Helvetica',
    getFontBytes: () => new Uint8Array(),
    assertTextSupported: () => {},
    measureText: (_name, text, size) => text.length * size * 0.5,
    ensureBrowserFont: async () => 'Helvetica',
    replaceFontBytes() {},
    embedPdfFont(pdfDocument) {
      const pdfDoc = pdfDocument as PDFDocument;
      const cached = cache.get(pdfDoc);
      if (cached) return cached;
      const embedded = pdfDoc.embedFont(StandardFonts.Helvetica);
      cache.set(pdfDoc, Promise.resolve(embedded));
      return Promise.resolve(embedded);
    },
  };
}

function textNode(id = 'el_text'): TextNode {
  return {
    kind: 'text',
    id: `${id}:node:text`,
    sourceElementId: id,
    box: { x: 20, y: 20, width: 80, height: 12 },
    rotate: 10,
    opacity: 1,
    clip: true,
    zIndex: 2,
    text: 'Invoice 123',
    style: {
      fontSize: 12,
      color: '#000000',
      fontWeight: 'normal',
      align: 'left',
      verticalAlign: 'top',
      lineHeight: 1.2,
      padding: [1, 1, 1, 1],
      border: { width: 0.5, color: '#333333', style: 'solid' },
    },
    layout: {
      lines: [{ text: 'Invoice 123', x: 1, y: 1, width: 25 }],
      lineHeightMm: 5,
      overflow: false,
    },
  };
}

function rectNode(): RectNode {
  return {
    kind: 'rect',
    id: 'el_rect:node:rect',
    sourceElementId: 'el_rect',
    box: { x: 10, y: 10, width: 100, height: 30 },
    rotate: 0,
    opacity: 0.25,
    clip: false,
    zIndex: 0,
    fill: '#f5f5f5',
    border: { width: 0.5, color: '#999999', style: 'dashed' },
  };
}

function lineNode(): LineNode {
  return {
    kind: 'line',
    id: 'el_line:node:line',
    sourceElementId: 'el_line',
    box: { x: 10, y: 50, width: 100, height: 2 },
    rotate: 0,
    opacity: 1,
    clip: false,
    zIndex: 1,
    from: { x: 0, y: 1 },
    to: { x: 100, y: 1 },
    width: 0.5,
    color: '#000000',
    style: 'solid',
  };
}

function ellipseNode(): EllipseNode {
  return {
    kind: 'ellipse',
    id: 'el_ellipse:node:ellipse',
    sourceElementId: 'el_ellipse',
    box: { x: 20, y: 60, width: 40, height: 20 },
    rotate: 0,
    opacity: 0.8,
    clip: false,
    zIndex: 1,
    fill: '#f5f5f5',
    border: { width: 0.5, color: '#292b29', style: 'dotted' },
  };
}

function gridNode(manager: PdfFontManager): GridNode {
  return layoutGridPresentation({
    kind: 'grid',
    id: 'el_summary:node:summary',
    sourceElementId: 'el_summary',
    box: { x: 20, y: 20, width: 50, height: 10 },
    rotate: 0,
    opacity: 1,
    clip: true,
    zIndex: 0,
    columns: [{ id: 'column_1', key: 'value', width: 1 }],
    rows: [{ id: 'row_1', height: 10 }],
    cells: {
      '0:value': { content: '', role: 'body', align: 'right' },
    },
    computedCells: {
      '0:value': {
        content: '1,234',
        prefixText: '$',
        role: 'body',
        align: 'right',
      },
    },
    layout: { cells: [], lines: [], height: 0 },
    style: {
      border: { width: 0.5, color: '#000000', style: 'solid' },
      headerHeight: 10,
      rowHeight: 10,
      fontSize: 10,
      cellPadding: 1,
    },
  }, manager);
}

function renderDocument(nodes: RenderNode[] = [rectNode(), lineNode(), textNode()]): RenderDocument {
  return {
    templateId: 'tpl_1',
    format,
    issues: [],
    pages: [{
      id: 'page_1',
      sourcePageId: 'page_1',
      continuationIndex: 0,
      size: { width: 210, height: 297 },
      padding: [10, 10, 10, 10],
      background: { kind: 'blank', color: '#ffffff' },
      nodes,
    }],
  };
}

function templateFile(): TemplateFile {
  return createBlankTemplateFile({
    idGenerator: prefix => `${prefix}_1`,
    name: 'Invoice Template',
  });
}

function multiPageDocument(pageCount: number): RenderDocument {
  const base = renderDocument();
  return {
    ...base,
    pages: Array.from({ length: pageCount }, (_, index) => ({
      ...base.pages[0],
      id: `page_${index + 1}`,
      sourcePageId: `page_${index + 1}`,
    })),
  };
}

/** Extracts the embedded font programs (FontFile2/FontFile3), decompressed. */
async function embeddedFontPrograms(bytes: Uint8Array): Promise<Uint8Array[]> {
  const loaded = await PDFDocument.load(bytes);
  const programs: Uint8Array[] = [];
  for (const [, object] of loaded.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    const ref = object.get(PDFName.of('FontFile2')) ?? object.get(PDFName.of('FontFile3'));
    if (!ref) continue;
    const stream = loaded.context.lookup(ref) as unknown as { dict: PDFDict; getContents(): Uint8Array };
    const contents = stream.getContents();
    const filter = stream.dict.get(PDFName.of('Filter'));
    programs.push(
      filter?.toString().includes('FlateDecode')
        ? new Uint8Array(inflateSync(Buffer.from(contents)))
        : contents,
    );
  }
  return programs;
}

describe('renderDocumentPdf', () => {
  it('renders a laid-out document and applies complete PDF document properties', async () => {
    const file = templateFile();
    file.template.metadata = {
      title: 'Template title',
      author: 'Template author',
      subject: 'Template subject',
      language: 'ja-JP',
    };
    const creationDate = new Date('2026-07-15T01:02:03.000Z');
    const modificationDate = new Date('2026-07-15T04:05:06.000Z');
    const bytes = await renderDocumentPdf({
      document: renderDocument(),
      file,
      fontManager: fontManager(),
      metadata: {
        title: 'Invoice 123',
        author: 'LayoutPDF',
        subject: 'Invoice',
        keywords: ['invoice', 'billing'],
        creator: 'LayoutPDF Editor',
        producer: 'LayoutPDF PDF Renderer',
        creationDate,
        modificationDate,
      },
    });

    assert.ok(bytes.length > 0);
    const loaded = await PDFDocument.load(bytes, { updateMetadata: false });
    assert.equal(loaded.getPageCount(), 1);
    assert.equal(loaded.getTitle(), 'Invoice 123');
    assert.equal(loaded.getAuthor(), 'LayoutPDF');
    assert.equal(loaded.getSubject(), 'Invoice');
    assert.equal(loaded.getKeywords(), 'invoice billing');
    assert.equal(loaded.catalog.lookup(PDFName.of('Lang'), PDFString).decodeText(), 'ja-JP');
    assert.equal(loaded.getCreator(), 'LayoutPDF Editor');
    assert.equal(loaded.getProducer(), 'LayoutPDF PDF Renderer');
    assert.equal(loaded.getCreationDate()?.toISOString(), creationDate.toISOString());
    assert.equal(loaded.getModificationDate()?.toISOString(), modificationDate.toISOString());
  });

  it('identifies LayoutPDF as the default PDF creator and producer', async () => {
    const bytes = await renderDocumentPdf({
      document: renderDocument(),
      file: templateFile(),
      fontManager: fontManager(),
    });

    const loaded = await PDFDocument.load(bytes, { updateMetadata: false });
    assert.equal(loaded.getTitle(), 'Invoice Template');
    assert.equal(loaded.getAuthor(), undefined);
    assert.equal(loaded.getCreator(), 'LayoutPDF');
    assert.equal(loaded.getProducer(), 'LayoutPDF PDF Renderer');
    assert.ok(loaded.getCreationDate() instanceof Date);
    assert.ok(loaded.getModificationDate() instanceof Date);
  });

  it('renders ellipse nodes with independent horizontal and vertical radii', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const originalDrawEllipse = Object.getPrototypeOf((await PDFDocument.create()).addPage()).drawEllipse;
    const pagePrototype = Object.getPrototypeOf((await PDFDocument.create()).addPage());
    pagePrototype.drawEllipse = function(options: Record<string, unknown>) {
      calls.push(options);
      return originalDrawEllipse.call(this, options);
    };

    try {
      const bytes = await renderDocumentPdf({
        document: renderDocument([ellipseNode()]),
        file: templateFile(),
        fontManager: fontManager(),
      });
      const loaded = await PDFDocument.load(bytes);
      assert.equal(loaded.getPageCount(), 1);
      assert.equal(calls.length, 1);
      assert.notEqual(calls[0].xScale, calls[0].yScale);
    } finally {
      pagePrototype.drawEllipse = originalDrawEllipse;
    }
  });

  it('copies PDF background pages from TemplateFile assets', async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 400]);
    const sourceBytes = await source.save();
    const file = templateFile();
    file.assets.asset_pdf = {
      kind: 'pdf',
      name: 'background.pdf',
      mimeType: 'application/pdf',
      dataEncoding: 'base64',
      data: Buffer.from(sourceBytes).toString('base64'),
    };
    const document = renderDocument([textNode()]);
    document.pages[0].background = { kind: 'pdf', assetId: 'asset_pdf', pageIndex: 0 };
    document.pages[0].size = { width: 300 * 25.4 / 72, height: 400 * 25.4 / 72 };

    const output = await renderDocumentPdf({ document, file, fontManager: fontManager() });
    const loaded = await PDFDocument.load(output);
    assert.equal(loaded.getPage(0).getWidth(), 300);
    assert.equal(loaded.getPage(0).getHeight(), 400);
  });

  it('copies all unique pages from one PDF background in a shared batch', async () => {
    const source = await PDFDocument.create();
    const sharedFont = await source.embedFont(StandardFonts.Helvetica);
    for (let index = 0; index < 3; index += 1) {
      const page = source.addPage([300 + index, 400 + index]);
      page.drawText(`Background ${index + 1}`, { font: sharedFont, size: 12 });
    }
    const sourceBytes = await source.save();
    const file = templateFile();
    file.assets.asset_pdf = {
      kind: 'pdf',
      name: 'multi-page-background.pdf',
      mimeType: 'application/pdf',
      dataEncoding: 'base64',
      data: Buffer.from(sourceBytes).toString('base64'),
    };
    const document = renderDocument([]);
    document.pages = [0, 1, 2, 0].map((sourcePageIndex, renderPageIndex) => ({
      ...document.pages[0],
      id: `page_${renderPageIndex + 1}`,
      sourcePageId: `page_${renderPageIndex + 1}`,
      size: { width: (300 + sourcePageIndex) * 25.4 / 72, height: (400 + sourcePageIndex) * 25.4 / 72 },
      background: { kind: 'pdf', assetId: 'asset_pdf', pageIndex: sourcePageIndex },
      nodes: [],
    }));
    const originalCopyPages = PDFDocument.prototype.copyPages;
    const copiedIndexBatches: number[][] = [];
    PDFDocument.prototype.copyPages = async function(sourceDocument, indices) {
      copiedIndexBatches.push([...indices]);
      return originalCopyPages.call(this, sourceDocument, indices);
    };

    try {
      const output = await renderDocumentPdf({ document, file, fontManager: fontManager() });
      const loaded = await PDFDocument.load(output);
      assert.equal(loaded.getPageCount(), 4);
      assert.deepEqual(loaded.getPages().map(page => page.getWidth()), [300, 301, 302, 300]);
      assert.deepEqual(copiedIndexBatches, [[0, 1, 2], [0]]);
    } finally {
      PDFDocument.prototype.copyPages = originalCopyPages;
    }
  });

  it('renders table cells from shared presentation layout', async () => {
    const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));
    const manager = createFontManager({
      NotoCJK: { data: fontBytes, fallback: true, subset: true },
    });
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
    element.props.footerStyle = {
      borderPreset: 'top',
      border: { width: 2, color: '#cc3300', style: 'dashed' },
    };
    const logical = tablePlugin.buildRenderNodes({
      element,
      value: [{ id: 'row_1', item: 'Design', quantity: 2, unitPrice: 100 }],
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager: manager,
        format,
        createNodeId: localId => `el_table:node:${localId}`,
        report: () => {},
      },
    })[0] as TableNode;
    const laidOut = layoutTablePresentation(computeTableNode(logical), manager, format);
    const bytes = await renderDocumentPdf({
      document: renderDocument([laidOut]),
      file: templateFile(),
      fontManager: manager,
    });

    const loaded = await PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), 1);
    assert.ok(bytes.length > 1000);
  });

  it('renders synthesized continuation titles from the paginated RenderTree', async () => {
    const manager = fontManager();
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 280 } });
    element.props.columns = element.props.columns.map((column, index) => ({
      ...column,
      label: ['Item', 'Quantity', 'Unit price', 'Amount'][index] ?? `Column ${index + 1}`,
    }));
    element.props.footers = element.props.footers.map((footer, index) => ({
      ...footer,
      label: ['Subtotal', 'Tax', 'Total'][index] ?? `Total ${index + 1}`,
    }));
    element.props.pagination = {
      ...element.props.pagination!,
      continuation: { title: 'Details continued', showFragmentIndex: true },
    };
    const logical = tablePlugin.buildRenderNodes({
      element,
      value: Array.from({ length: 8 }, (_, index) => ({
        id: `row_${index}`,
        item: `Item ${index + 1}`,
        quantity: 1,
        unitPrice: 100,
      })),
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager: manager,
        format,
        createNodeId: localId => `el_table:node:${localId}`,
        report: () => {},
      },
    })[0];
    const laidOut = layoutRenderTree(
      computeProducerNodes(renderDocument([logical])),
      { fontManager: manager },
    );
    const bytes = await renderDocumentPdf({
      document: laidOut,
      file: templateFile(),
      fontManager: manager,
    });
    const loaded = await PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), laidOut.pages.length);
    const searchable = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
    const continuationPage = await searchable.getPage(2);
    const content = await continuationPage.getTextContent();
    assert.ok(content.items.some(item => 'str' in item && item.str === 'Details continued 1'));
  });

  it('renders runtime grid prefixes and numbers from shared layout into a real PDF', async () => {
    const manager = fontManager();
    const pagePrototype = Object.getPrototypeOf((await PDFDocument.create()).addPage());
    const originalDrawText = pagePrototype.drawText;
    const drawnText: string[] = [];
    pagePrototype.drawText = function(text: string, options: Record<string, unknown>) {
      drawnText.push(text);
      return originalDrawText.call(this, text, options);
    };

    try {
      const bytes = await renderDocumentPdf({
        document: renderDocument([gridNode(manager)]),
        file: templateFile(),
        fontManager: manager,
      });
      const loaded = await PDFDocument.load(bytes);
      assert.equal(loaded.getPageCount(), 1);
      assert.ok(drawnText.includes('$'));
      assert.ok(drawnText.includes('1,234'));
    } finally {
      pagePrototype.drawText = originalDrawText;
    }
  });

  it('blocks documents with render errors before creating a PDF', async () => {
    const document = renderDocument();
    document.issues.push({ severity: 'error', code: 'BROKEN', message: 'broken' });
    await assert.rejects(
      () => renderDocumentPdf({ document, file: templateFile(), fontManager: fontManager() }),
      (error: unknown) => error instanceof LayoutPDFValidationError && error.issues[0].code === 'BROKEN',
    );
  });

  it('produces a smaller PDF when subsetter is enabled', async () => {
    const wasmBytes = new Uint8Array(await readFile('public/fonts/hb-subset.wasm'));
    await initWithBytes(wasmBytes);
    const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));
    const manager = createFontManager({
      NotoCJK: { data: fontBytes, fallback: true, subset: false },
    });
    const doc = renderDocument([textNode()]);
    const full = await renderDocumentPdf({ document: doc, file: templateFile(), fontManager: manager });
    const subset = await renderDocumentPdf({ document: doc, file: templateFile(), fontManager: manager, subsetter: true });

    assert.ok(subset.length < full.length, `Subset PDF (${subset.length}) should be smaller than full (${full.length})`);

    const loaded = await PDFDocument.load(subset);
    assert.equal(loaded.getPageCount(), 1);
    assert.ok(subset.length > 100);
  });

  it('subsets and embeds separate real Regular and Bold faces', async () => {
    const wasmBytes = new Uint8Array(await readFile('public/fonts/hb-subset.wasm'));
    await initWithBytes(wasmBytes);
    const [regularBytes, boldBytes] = await Promise.all([
      readFile('public/fonts/NotoSansCJKjp-Regular.otf'),
      readFile('public/fonts/NotoSansCJKjp-Bold.otf'),
    ]);
    const manager = createFontManager({
      Regular: {
        data: new Uint8Array(regularBytes),
        fallback: true,
        family: 'NotoCJK',
        weight: 'normal',
      },
      Bold: {
        data: new Uint8Array(boldBytes),
        family: 'NotoCJK',
        weight: 'bold',
      },
    });
    const normal = textNode('el_normal');
    normal.text = '通常文字';
    normal.layout.lines = [{ text: normal.text, x: 1, y: 1, width: 20 }];
    normal.style.fontName = 'Regular';
    const bold = textNode('el_bold');
    bold.text = '太字文字';
    bold.layout.lines = [{ text: bold.text, x: 1, y: 1, width: 20 }];
    bold.style.fontName = 'Bold';
    bold.style.fontWeight = 'bold';
    bold.style.syntheticBold = false;
    const embeddedNames = new Set<string>();
    const embedPdfFont = manager.embedPdfFont.bind(manager);
    manager.embedPdfFont = (pdfDocument, name) => {
      embeddedNames.add(name);
      return embedPdfFont(pdfDocument, name);
    };

    const bytes = await renderDocumentPdf({
      document: renderDocument([normal, bold]),
      file: templateFile(),
      fontManager: manager,
      subsetter: true,
    });

    assert.deepEqual(embeddedNames, new Set(['Regular', 'Bold']));
    assert.ok(bytes.length < regularBytes.length + boldBytes.length);
    const loaded = await PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), 1);
  });

  it('embeds subset fonts whose CID-keyed CFF charset keeps CID equal to glyph id', async () => {
    const wasmBytes = new Uint8Array(await readFile('public/fonts/hb-subset.wasm'));
    await initWithBytes(wasmBytes);
    const [regularBytes, boldBytes] = await Promise.all([
      readFile('public/fonts/NotoSansCJKjp-Regular.otf'),
      readFile('public/fonts/NotoSansCJKjp-Bold.otf'),
    ]);
    const manager = createFontManager({
      Regular: {
        data: new Uint8Array(regularBytes),
        fallback: true,
        family: 'NotoCJK',
        weight: 'normal',
      },
      Bold: {
        data: new Uint8Array(boldBytes),
        family: 'NotoCJK',
        weight: 'bold',
      },
    });
    const node = textNode();
    node.text = '請求書 合計 ¥12,345';
    node.layout.lines = [{ text: node.text, x: 1, y: 1, width: 60 }];
    node.style.fontName = 'Regular';

    const bytes = await renderDocumentPdf({
      document: renderDocument([node]),
      file: templateFile(),
      fontManager: manager,
      subsetter: true,
    });

    const programs = await embeddedFontPrograms(bytes);
    assert.ok(programs.length >= 1, 'expected at least one embedded font program');
    for (const program of programs) {
      assertCffCharsetIdentity(program, 'embedded subset font');
    }
    assert.ok(bytes.length < regularBytes.length + boldBytes.length);
  });

  it('reports unsupported nodes with element and page context', async () => {
    const table: TableNode = {
      kind: 'table',
      id: 'el_table:node:table',
      sourceElementId: 'el_table',
      box: { x: 10, y: 10, width: 100, height: 100 },
      rotate: 0,
      opacity: 1,
      clip: true,
      zIndex: 0,
      columns: [],
      rows: [],
      computedRows: [],
      footers: [],
      computedFooters: [],
      layout: { cells: [], lines: [], height: 0 },
      style: {
        headerHeight: 8,
        rowHeight: 7,
        fontSize: 10,
        border: { width: 0.5, color: '#000000', style: 'solid' },
        headerBackground: '#eeeeee',
        headerColor: '#000000',
        bodyColor: '#000000',
      },
    };
    await assert.rejects(
      () => renderDocumentPdf({
        document: renderDocument([table]),
        file: templateFile(),
        fontManager: fontManager(),
      }),
      /Failed to render element el_table on page page_1: Table node has no shared layout cells/,
    );
  });

  it('renders only the requested page range and reports progress', async () => {
    const document = multiPageDocument(3);
    const events: PdfProgressEvent[] = [];
    const bytes = await renderDocumentPdf({
      document,
      file: templateFile(),
      fontManager: fontManager(),
      pageRange: [2, 3],
      onProgress: event => events.push(event),
    });

    const loaded = await PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), 2);
    assert.deepEqual(
      events.map(event => `${event.phase}:${event.page ?? '-'}:${event.completedPages}/${event.pageCount}`),
      [
        'prepare:-:0/2',
        'render:1:0/2',
        'render:2:1/2',
        'save:-:2/2',
      ],
    );
  });

  it('rejects invalid page ranges', async () => {
    const document = multiPageDocument(3);
    await assert.rejects(
      () => renderDocumentPdf({
        document,
        file: templateFile(),
        fontManager: fontManager(),
        pageRange: [0, 1],
      }),
      /Invalid pageRange/,
    );
    await assert.rejects(
      () => renderDocumentPdf({
        document,
        file: templateFile(),
        fontManager: fontManager(),
        pageRange: [2, 4],
      }),
      /exceeds document page count 3/,
    );
    await assert.rejects(
      () => renderDocumentPdf({
        document,
        file: templateFile(),
        fontManager: fontManager(),
        pageRange: [2, 1],
      }),
      /Invalid pageRange/,
    );
  });

  it('aborts between pages when the signal is cancelled', async () => {
    const document = multiPageDocument(3);
    const controller = new AbortController();

    await assert.rejects(
      () => renderDocumentPdf({
        document,
        file: templateFile(),
        fontManager: fontManager(),
        signal: controller.signal,
        onProgress: event => {
          if (event.phase === 'render' && event.page === 2) controller.abort();
        },
      }),
      /abort/i,
    );
  });

  it('treats warnings as fatal only in strict mode', async () => {
    const document: RenderDocument = {
      ...renderDocument(),
      issues: [{ severity: 'warning', code: 'TEST_WARNING', message: 'Test warning' }],
    };

    const bytes = await renderDocumentPdf({
      document,
      file: templateFile(),
      fontManager: fontManager(),
    });
    assert.ok(bytes.length > 0);

    await assert.rejects(
      () => renderDocumentPdf({
        document,
        file: templateFile(),
        fontManager: fontManager(),
        strict: true,
      }),
      (error: unknown) =>
        error instanceof LayoutPDFValidationError
        && error.issues[0]?.code === 'TEST_WARNING',
    );
  });
});
