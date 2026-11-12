import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
} from 'pdf-lib';
import type { TemplateFile } from '../../core/document.js';
import { createBlankTemplateFile } from '../../core/document.js';
import { LayoutPDFValidationError } from '../../utils/errors.js';
import type { PdfFontManager } from '../font/fontManager.js';
import type { RenderDocument, TableNode } from '../../renderTree/model.js';
import { FORMULA_ERROR } from '../../renderTree/model.js';
import { computeTableNode } from '../../renderTree/tableLayout.js';
import {
  layoutTablePresentation,
  measureTableRowHeights,
} from '../../renderTree/tablePresentation.js';
import { tablePlugin } from '../../../plugins/table/table.js';
import { renderDocumentPdf } from './renderDocumentPdf.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';
import { formulaErrorText } from '@/i18n/locales.js';

const enFormat = defaultFormatSettingsForLocale('en-US');

function fontManager(): PdfFontManager {
  const cache = new WeakMap<object, Promise<PDFFont>>();
  const embedPdfFont: PdfFontManager['embedPdfFont'] = (pdfDocument) => {
    const pdfDoc = pdfDocument as PDFDocument;
    const cached = cache.get(pdfDoc);
    if (cached) return cached;
    const embedded = pdfDoc.embedFont(StandardFonts.Helvetica);
    cache.set(pdfDoc, Promise.resolve(embedded));
    return Promise.resolve(embedded);
  };
  return {
    getDefaultFontName: () => 'Helvetica',
    getFontBytes: () => new Uint8Array(),
    assertTextSupported: () => {},
    measureText: (_name, text, size) => text.length * size * 0.5,
    ensureBrowserFont: async () => 'Helvetica',
    replaceFontBytes() {},
    embedPdfFont,
  };
}

function templateFile(): TemplateFile {
  return createBlankTemplateFile({
    idGenerator: prefix => `${prefix}_1`,
    name: 'Invoice Template',
  });
}

function tableNodeWithFormulaError(): TableNode {
  const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
  element.props.columns = [
    { id: 'col_input', label: 'Input', key: 'input', width: 1, valueType: 'number', align: 'right' },
    {
      id: 'col_x',
      label: 'X',
      key: 'x',
      width: 1,
      valueType: 'formula',
      align: 'right',
      formula: { kind: 'expression', expression: 'row.input / 0' },
    },
  ];
  element.props.footers = [];
  const logical = tablePlugin.buildRenderNodes({
    element,
    value: [{ id: 'row_1', input: 2 }],
    context: {
      pageId: 'page_1',
      pageSize: { width: 210, height: 297 },
      input: {},
      fontManager: fontManager(),
      format: enFormat,
      createNodeId: localId => `el_table:node:${localId}`,
      report: () => {},
    },
  })[0] as TableNode;
  const computed = computeTableNode(logical);
  assert.equal(computed.computedRows[0].x, FORMULA_ERROR);
  return computed;
}

describe('renderTablePdf', () => {
  it('draws each shared wrapped table line at its precomputed position', async () => {
    const manager = fontManager();
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
    element.box.width = 60;
    element.props.columns = [{
      id: 'col_description',
      label: 'Description',
      key: 'description',
      width: 1,
      valueType: 'text',
      align: 'left',
    }];
    element.props.footers = [];
    const logical = tablePlugin.buildRenderNodes({
      element,
      value: [{ id: 'row_1', description: 'A long service description that wraps across lines' }],
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager: manager,
        format: enFormat,
        createNodeId: localId => `el_table:node:${localId}`,
        report: () => {},
      },
    })[0] as TableNode;
    const computed = computeTableNode(logical);
    const laidOut = layoutTablePresentation(
      measureTableRowHeights(computed, manager, enFormat),
      manager,
      enFormat,
    );
    const wrappedCell = laidOut.layout.cells.find(cell =>
      cell.role === 'body' && cell.columnKey === 'description'
    )!;
    assert.ok((wrappedCell.lines?.length ?? 0) > 1);

    const pagePrototype = Object.getPrototypeOf((await PDFDocument.create()).addPage());
    const originalDrawText = pagePrototype.drawText;
    const drawnText: string[] = [];
    pagePrototype.drawText = function(text: string, options: Record<string, unknown>) {
      drawnText.push(text);
      return originalDrawText.call(this, text, options);
    };
    try {
      await renderDocumentPdf({
        document: {
          templateId: 'tpl_1',
          format: enFormat,
          issues: [],
          pages: [{
            id: 'page_1',
            sourcePageId: 'page_1',
            continuationIndex: 0,
            size: { width: 210, height: 297 },
            padding: [10, 10, 10, 10],
            background: { kind: 'blank', color: '#ffffff' },
            nodes: [laidOut],
          }],
        },
        file: templateFile(),
        fontManager: manager,
      });
      for (const line of wrappedCell.lines ?? []) assert.ok(drawnText.includes(line.text));
    } finally {
      pagePrototype.drawText = originalDrawText;
    }
  });

  it('renders error cells with placeholder text and the error background without throwing', async () => {
    const manager = fontManager();
    const laidOut = layoutTablePresentation(tableNodeWithFormulaError(), manager, enFormat);
    const pagePrototype = Object.getPrototypeOf((await PDFDocument.create()).addPage());
    const originalDrawText = pagePrototype.drawText;
    const drawnText: string[] = [];
    pagePrototype.drawText = function(text: string, options: Record<string, unknown>) {
      drawnText.push(text);
      return originalDrawText.call(this, text, options);
    };
    const originalDrawRectangle = pagePrototype.drawRectangle;
    const rectangles: Array<Record<string, unknown>> = [];
    pagePrototype.drawRectangle = function(options: Record<string, unknown>) {
      rectangles.push(options);
      return originalDrawRectangle.call(this, options);
    };

    try {
      const bytes = await renderDocumentPdf({
        document: {
          templateId: 'tpl_1',
          format: enFormat,
          issues: [],
          pages: [{
            id: 'page_1',
            sourcePageId: 'page_1',
            continuationIndex: 0,
            size: { width: 210, height: 297 },
            padding: [10, 10, 10, 10],
            background: { kind: 'blank', color: '#ffffff' },
            nodes: [laidOut],
          }],
        },
        file: templateFile(),
        fontManager: manager,
      });

      const loaded = await PDFDocument.load(bytes);
      assert.equal(loaded.getPageCount(), 1);
      assert.ok(drawnText.includes(formulaErrorText('en-US')));
      const background = rectangles.find(rect => {
        const color = rect.color as { red: number; green: number; blue: number } | undefined;
        if (!color) return false;
        return Math.abs(color.red - 254 / 255) < 0.001
          && Math.abs(color.green - 226 / 255) < 0.001
          && Math.abs(color.blue - 226 / 255) < 0.001;
      });
      assert.ok(background, 'expected an error cell background rectangle');
    } finally {
      pagePrototype.drawText = originalDrawText;
      pagePrototype.drawRectangle = originalDrawRectangle;
    }
  });

  it('blocks production PDF export when a table formula evaluation fails', async () => {
    const file = templateFile();
    const manager = fontManager();
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
    element.props.columns = [
      { id: 'col_input', label: 'Input', key: 'input', width: 1, valueType: 'number', align: 'right' },
      {
        id: 'col_x',
        label: 'X',
        key: 'x',
        width: 1,
        valueType: 'formula',
        align: 'right',
        formula: { kind: 'expression', expression: 'row.input / 0' },
      },
    ];
    element.props.footers = [];
    const logical = tablePlugin.buildRenderNodes({
      element,
      value: [{ id: 'row_1', input: 2 }],
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager: manager,
        format: enFormat,
        createNodeId: localId => `el_table:node:${localId}`,
        report: () => {},
      },
    })[0] as TableNode;
    const computed = computeTableNode(logical);
    assert.ok((computed.formulaErrors ?? []).length > 0);

    const document: RenderDocument = {
      templateId: 'tpl_1',
      format: enFormat,
      issues: [
        {
          severity: 'error',
          code: 'TABLE_FORMULA_EVALUATION_FAILED',
          message: 'Table formula failed in column "x" of row 1.',
          pageId: 'page_1',
          elementId: element.id,
          values: { rowId: 'row_1', rowIndex: 0, columnKey: 'x' },
        },
      ],
      pages: [{
        id: 'page_1',
        sourcePageId: 'page_1',
        continuationIndex: 0,
        size: { width: 210, height: 297 },
        padding: [10, 10, 10, 10],
        background: { kind: 'blank', color: '#ffffff' },
        nodes: [computed],
      }],
    };

    await assert.rejects(
      () => renderDocumentPdf({ document, file, fontManager: manager }),
      (error: unknown) => error instanceof LayoutPDFValidationError
        && error.issues.some(issue => issue.code === 'TABLE_FORMULA_EVALUATION_FAILED'),
    );
  });
});
