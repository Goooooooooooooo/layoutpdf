import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FontManager } from '../pdf/font/fontManager.js';
import { tablePlugin } from '../../plugins/table/table.js';
import { FORMULA_ERROR, type TableNode } from './model.js';
import { computeTableNode } from './tableLayout.js';
import {
  DEFAULT_TABLE_CELL_PADDING_MM,
  FORMULA_ERROR_BACKGROUND,
  layoutTablePresentation,
  measureTableRowHeights,
} from './tablePresentation.js';
import { formulaErrorText } from '@/i18n/locales.js';
import { pdfPtToMm } from '@/engine/utils/units.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'TestFont',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: (_name, text) => {
    if (text.includes('unsupported')) throw new Error('missing table glyph');
  },
  measureText: (_name, text, size) => text.length * size * 0.5,
  ensureBrowserFont: async () => 'TestFont',
};

const jaFormat = defaultFormatSettingsForLocale('ja-JP');
const enFormat = defaultFormatSettingsForLocale('en-US');

function node(): TableNode {
  const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
  return computeTableNode(tablePlugin.buildRenderNodes({
    element,
    value: [
      { id: 'row_1', item: '設計', quantity: 2, unitPrice: 100 },
      { id: 'row_2', item: '実装', quantity: 3, unitPrice: 200 },
    ],
    context: {
      pageId: 'page_1',
      pageSize: { width: 210, height: 297 },
      input: {},
      fontManager,
      format: jaFormat,
      createNodeId: localId => `el_table:node:${localId}`,
      report: () => {},
    },
  })[0] as TableNode);
}

describe('layoutTablePresentation', () => {
  it('measures and publishes real Bold faces for bold cells only', () => {
    const manager: FontManager = {
      ...fontManager,
      resolveFontFace: (_name, weight) => ({
        name: weight === 'bold' ? 'TestFontBold' : 'TestFont',
        syntheticBold: false,
      }),
    };
    const output = layoutTablePresentation(node(), manager, jaFormat);
    const header = output.layout.cells.find(cell => cell.role === 'header')!;
    const body = output.layout.cells.find(cell => cell.role === 'body')!;

    assert.equal(header.fontName, 'TestFontBold');
    assert.equal(header.syntheticBold, false);
    assert.equal(body.fontName, 'TestFont');
  });

  it('keeps a blank row blank instead of printing zero', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
    const blank = computeTableNode(tablePlugin.buildRenderNodes({
      element,
      value: [{ id: 'row_blank' }],
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager,
        format: jaFormat,
        createNodeId: localId => `el_table:node:${localId}`,
        report: () => {},
      },
    })[0] as TableNode);
    const output = layoutTablePresentation(blank, fontManager, jaFormat);
    const cells = output.layout.cells.filter(cell =>
      cell.role === 'body' && cell.rowIndex === 0
    );
    assert.deepEqual(cells.map(cell => cell.text), ['', '', '', '']);
  });

  it('wraps long text cells and grows every cell in the row to the measured height', () => {
    const input = node();
    input.box.width = 60;
    input.computedRows[0].item = '詳細な作業内容を複数行で表示します';
    const measured = measureTableRowHeights(input, fontManager, jaFormat);
    const output = layoutTablePresentation(measured, fontManager, jaFormat);
    const item = output.layout.cells.find(cell =>
      cell.role === 'body' && cell.rowIndex === 0 && cell.columnKey === 'item'
    )!;
    const amount = output.layout.cells.find(cell =>
      cell.role === 'body' && cell.rowIndex === 0 && cell.columnKey === 'amount'
    )!;

    assert.ok((measured.rowHeights?.[0] ?? 0) > input.style.rowHeight);
    assert.ok((item.lines?.length ?? 0) > 1);
    assert.equal(item.box.height, measured.rowHeights?.[0]);
    assert.equal(amount.box.height, item.box.height);
    assert.equal(output.layout.height,
      input.style.headerHeight
      + measured.rowHeights!.reduce((sum, height) => sum + height, 0)
      + input.computedFooters.length * input.style.rowHeight);
  });

  it('preserves explicit newlines when measuring a text cell', () => {
    const input = node();
    input.computedRows[0].item = '第一行\n第二行';
    const measured = measureTableRowHeights(input, fontManager, jaFormat);
    const output = layoutTablePresentation(measured, fontManager, jaFormat);
    const item = output.layout.cells.find(cell =>
      cell.role === 'body' && cell.rowIndex === 0 && cell.columnKey === 'item'
    )!;

    assert.deepEqual(item.lines?.map(line => line.text), ['第一行', '第二行']);
    assert.ok(item.box.height > input.style.rowHeight);
  });

  it('creates shared cells and unique grid lines from computed values', () => {
    const output = layoutTablePresentation(node(), fontManager, jaFormat);
    assert.equal(output.layout.cells.length, 4 + 8 + 6);
    assert.ok(output.layout.lines.length > 0);
    assert.equal(output.layout.height, 8 + 2 * 7 + 3 * 7);
    assert.equal(output.box.height, output.layout.height);

    const amount = output.layout.cells.find(cell =>
      cell.role === 'body' && cell.rowIndex === 0 && cell.columnKey === 'amount'
    );
    assert.equal(amount?.text, '200');
    assert.equal(amount?.valueType, 'formula');
    assert.ok((amount?.textX ?? 0) > amount!.box.x);

    const halfBorder = pdfPtToMm(output.style.border.width) / 2;
    const expectedOuterLines = [
      [0, halfBorder, output.box.width, halfBorder],
      [0, output.layout.height - halfBorder, output.box.width, output.layout.height - halfBorder],
      [halfBorder, 0, halfBorder, output.layout.height],
      [output.box.width - halfBorder, 0, output.box.width - halfBorder, output.layout.height],
    ];
    for (const expected of expectedOuterLines) {
      assert.ok(output.layout.lines.some(line => {
        const actual = [line.from.x, line.from.y, line.to.x, line.to.y];
        const reversed = [line.to.x, line.to.y, line.from.x, line.from.y];
        return actual.every((value, index) => Math.abs(value - expected[index]) < 0.000001)
          || reversed.every((value, index) => Math.abs(value - expected[index]) < 0.000001);
      }), `missing continuous outer line ${expected.join(',')}`);
    }

    const grouped = new Map<string, Array<[number, number]>>();
    for (const line of output.layout.lines) {
      const horizontal = Math.abs(line.from.y - line.to.y) < 0.000001;
      const fixed = horizontal ? line.from.y : line.from.x;
      const first = horizontal ? line.from.x : line.from.y;
      const second = horizontal ? line.to.x : line.to.y;
      const key = `${horizontal ? 'h' : 'v'}:${fixed.toFixed(6)}`;
      const intervals = grouped.get(key) ?? [];
      intervals.push([Math.min(first, second), Math.max(first, second)]);
      grouped.set(key, intervals);
    }
    for (const intervals of grouped.values()) {
      intervals.sort((left, right) => left[0] - right[0]);
      for (let index = 1; index < intervals.length; index++) {
        assert.ok(intervals[index][0] > intervals[index - 1][1] + 0.000001);
      }
    }
  });

  it('hides inline footer presentation without removing computed outputs', () => {
    const input = node();
    input.showInlineFooter = false;
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    assert.equal(output.layout.cells.some(cell =>
      cell.role === 'footer-label' || cell.role === 'footer-value'
    ), false);
    assert.equal(output.computedFooters.length, 3);
    assert.equal(output.outputs?.length, 3);
    assert.equal(output.layout.height, 8 + 2 * 7);
  });

  it('applies configurable cell padding and header weight in shared layout', () => {
    const input = node();
    input.style.cellPadding = 3;
    input.style.headerBold = false;
    input.columns[0].headerAlign = 'left';
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const header = output.layout.cells.find(cell =>
      cell.role === 'header' && cell.columnKey === 'item'
    )!;
    const body = output.layout.cells.find(cell =>
      cell.role === 'body' && cell.columnKey === 'item'
    )!;

    assert.equal(header.bold, false);
    assert.equal(header.textX, header.box.x + 3);
    assert.equal(body.textX, body.box.x + 3);
    assert.ok(header.textY >= header.box.y + 3);
    assert.ok(body.textY >= body.box.y + 3);
  });

  it('lays out header and body alignment independently with a legacy header fallback', () => {
    const input = node();
    input.columns[0] = {
      ...input.columns[0],
      align: 'right',
      headerAlign: 'left',
    };
    delete input.columns[1].headerAlign;

    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const itemHeader = output.layout.cells.find(cell =>
      cell.role === 'header' && cell.columnKey === 'item'
    );
    const itemBody = output.layout.cells.find(cell =>
      cell.role === 'body' && cell.rowIndex === 0 && cell.columnKey === 'item'
    );
    const quantityHeader = output.layout.cells.find(cell =>
      cell.role === 'header' && cell.columnKey === 'quantity'
    );

    assert.equal(itemHeader?.align, 'left');
    assert.equal(itemBody?.align, 'right');
    assert.equal(quantityHeader?.align, 'center');
  });

  it('uses fragment row bounds and omits footer before the final fragment', () => {
    const input = node();
    input.fragment = { rowStart: 1, rowEnd: 2, repeatHeader: true, includeFooter: false };
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    assert.equal(output.layout.cells.filter(cell => cell.role === 'body').length, 4);
    assert.equal(output.layout.cells.some(cell => cell.role.startsWith('footer')), false);
    assert.ok(output.layout.cells.some(cell => cell.rowIndex === 1));
    assert.equal(output.layout.height, 15);
  });

  it('places each footer in configured columns and uses its own font size', () => {
    const input = node();
    input.computedFooters[0] = {
      ...input.computedFooters[0],
      startColumnKey: 'unitPrice',
      valueColumnKey: 'amount',
      fontSize: 16,
    };
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const label = output.layout.cells.find(cell => cell.id.endsWith('footer-label:footer_subtotal'));
    const value = output.layout.cells.find(cell => cell.id.endsWith('footer-value:footer_subtotal'));

    assert.ok(label);
    assert.ok(value);
    assert.ok(label.box.x > 0);
    assert.equal(label.box.x + label.box.width, value.box.x);
    assert.equal(label.fontSize, 16);
    assert.equal(value.fontSize, 16);
  });

  it('keeps non-text business values on one measured ellipsis line', () => {
    const input = node();
    input.box.width = 20;
    input.columns = [{
      id: 'issued_at',
      label: 'Date',
      key: 'issuedAt',
      width: 1,
      valueType: 'date',
      align: 'left',
    }];
    input.computedRows[0].issuedAt = '2026-07-16';
    input.computedFooters = [];
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const date = output.layout.cells.find(cell => cell.role === 'body' && cell.columnKey === 'issuedAt');
    assert.ok(date?.text.endsWith('...'));
    assert.equal(date?.lines, undefined);
  });

  it('surfaces font coverage failures before either backend renders', () => {
    const input = node();
    input.computedRows[0].item = 'unsupported';
    assert.throws(() => layoutTablePresentation(input, fontManager, jaFormat), /missing table glyph/);
  });

  it('formats table values with the document locale', () => {
    const input = node();
    input.columns[0] = { ...input.columns[0], valueType: 'date', key: 'issuedAt' };
    input.computedRows[0].issuedAt = '2026-07-16';
    input.computedRows[0].unitPrice = 1234.5;
    input.columns[2] = { ...input.columns[2], decimalPlaces: 1 };

    const output = layoutTablePresentation(input, fontManager, enFormat);

    const date = output.layout.cells.find(cell =>
      cell.role === 'body' && cell.rowIndex === 0 && cell.columnKey === 'issuedAt'
    );
    const price = output.layout.cells.find(cell =>
      cell.role === 'body' && cell.rowIndex === 0 && cell.columnKey === 'unitPrice'
    );
    assert.equal(date?.text, 'July 16, 2026');
    assert.equal(price?.text, '$1,234.5');
  });

  it('supports attached and left-edge numeric prefixes inside table cells', () => {
    const input = node();
    input.columns[3] = {
      ...input.columns[3],
      numericFormat: { prefix: '¥', symbolLayout: 'edge', zeroDisplay: 'dash', emptyDisplay: 'dash' },
    };
    input.columns[2] = {
      ...input.columns[2],
      numericFormat: { prefix: '¥', symbolLayout: 'attached', zeroDisplay: 'zero', emptyDisplay: 'blank' },
    };
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const edge = output.layout.cells.find(cell => cell.role === 'body' && cell.columnKey === 'amount');
    const attached = output.layout.cells.find(cell => cell.role === 'body' && cell.columnKey === 'unitPrice');

    assert.equal(edge?.prefixText, '¥');
    assert.equal(edge?.text, '200');
    assert.equal(edge?.prefixTextX, edge!.box.x + DEFAULT_TABLE_CELL_PADDING_MM);
    assert.equal(attached?.prefixText, undefined);
    assert.equal(attached?.text, '¥100');
  });

  it('lays out footer band headers and values in two rows without changing calculations', () => {
    const input = node();
    input.computedFooters = input.computedFooters.map(footer => ({
      ...footer,
      numericFormat: { prefix: '¥', symbolLayout: 'edge', zeroDisplay: 'dash', emptyDisplay: 'blank' },
    }));
    input.footerBand = {
      enabled: true,
      label: '合計',
      startColumnKey: 'quantity',
      leadWidth: 1,
      headerHeight: 5,
      valueHeight: 7,
      items: [...input.computedFooters].reverse().map(footer => ({ footerId: footer.id, width: 2 })),
    };
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const bandHeaders = output.layout.cells.filter(cell => cell.id.includes('footer-band-header'));
    const bandValues = output.layout.cells.filter(cell => cell.id.includes('footer-band-value'));

    assert.equal(output.layout.height, 8 + 2 * 7 + 12);
    assert.deepEqual(bandHeaders.map(cell => cell.text), ['合計', '消費税', '小計']);
    assert.deepEqual(bandValues.map(cell => cell.text), ['880', '80', '800']);
    assert.ok(bandValues.every(cell => cell.prefixText === '¥'));
    assert.deepEqual(input.computedFooters.map(footer => footer.value), [800, 80, 880]);

    // Verify proportional widths: weights=[lead=1, item1=2, item2=2, item3=2]
    const totalWeight = 1 + 2 + 2 + 2;
    const startX = output.layout.cells.find(cell =>
      cell.role === 'header' && cell.columnKey === 'quantity'
    )!.box.x;
    const availableWidth = output.box.width - startX;
    // Lead label occupies weight 1 portion
    let expectedX = startX + availableWidth * 1 / totalWeight;
    for (const cell of bandValues) {
      const expectedWidth = availableWidth * 2 / totalWeight;
      assert.ok(Math.abs(cell.box.x - expectedX) < 0.001,
        `footer band value x should be ${expectedX}, got ${cell.box.x}`);
      assert.ok(Math.abs(cell.box.width - expectedWidth) < 0.001,
        `footer band value width should be ${expectedWidth}, got ${cell.box.width}`);
      expectedX += expectedWidth;
    }
  });

  it('splits a narrow footer band independently for 1, 2, 4, and 8 totals', () => {
    for (const count of [1, 2, 4, 8]) {
      const input = node();
      const prototype = input.computedFooters[0];
      input.computedFooters = Array.from({ length: count }, (_, index) => ({
        ...prototype,
        id: `footer_${index}`,
        label: `F${index + 1}`,
        value: index + 1,
        fontSize: 8 + index,
      }));
      input.footerBand = {
        enabled: true,
        label: 'T',
        startColumnKey: 'amount',
        leadWidth: 1,
        headerHeight: 5,
        valueHeight: 7,
        items: input.computedFooters.map((footer, index) => ({
          footerId: footer.id,
          width: index + 1,
        })),
      };

      const output = layoutTablePresentation(input, fontManager, jaFormat);
      const values = output.layout.cells.filter(cell => cell.id.includes('footer-band-value'));
      const amountColumn = output.layout.cells.find(cell =>
        cell.role === 'header' && cell.columnKey === 'amount'
      )!;
      const availableWidth = output.box.width - amountColumn.box.x;
      const lead = output.layout.cells.find(cell => cell.id.endsWith('footer-band-label'))!;
      const occupiedWidth = lead.box.width + values.reduce(
        (sum, cell) => sum + cell.box.width,
        0,
      );

      assert.equal(values.length, count);
      assert.ok(values.every(cell => cell.box.width > 0));
      assert.ok(Math.abs(occupiedWidth - availableWidth) < 0.001);
      assert.deepEqual(values.map(cell => cell.fontSize), input.computedFooters.map(
        footer => footer.fontSize,
      ));
    }
  });

  it('renders a footer top-emphasis preset with its own border style', () => {
    const input = node();
    input.footerBand = {
      enabled: true,
      label: '合計',
      startColumnKey: 'quantity',
      leadWidth: 1,
      headerHeight: 5,
      valueHeight: 7,
      items: input.computedFooters.map(footer => ({ footerId: footer.id, width: 1 })),
    };
    input.footerStyle = {
      borderPreset: 'top',
      border: { width: 2, color: '#cc3300', style: 'dashed' },
    };
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const footerCells = output.layout.cells.filter(cell =>
      cell.role === 'footer-label' || cell.role === 'footer-value'
    );
    const footerLines = output.layout.lines.filter(line => line.border);
    const footerContentStartX = Math.min(...footerCells.map(cell => cell.box.x));
    const expectedY = Math.min(...footerCells.map(cell => cell.box.y));

    assert.equal(footerLines.length, 1);
    assert.deepEqual(footerLines[0].border, input.footerStyle.border);
    assert.equal(footerLines[0].from.x, footerContentStartX);
    assert.equal(footerLines[0].from.y, expectedY);
    assert.ok(Math.abs(footerLines[0].to.x - output.box.width) < 0.001);
    assert.equal(footerLines[0].to.y, expectedY);
    assert.ok(footerContentStartX > 0);
    const precedingBodyBoundary = output.layout.lines.find(line =>
      !line.border
      && line.from.y === expectedY
      && line.to.y === expectedY
      && line.from.x === 0
    );
    assert.ok(precedingBodyBoundary);
    assert.equal(precedingBodyBoundary.to.x, footerContentStartX);
  });

  it('removes footer borders without opening the body edge before an inset footer', () => {
    const input = node();
    input.footerBand = {
      enabled: true,
      label: '合計',
      startColumnKey: 'quantity',
      leadWidth: 1,
      headerHeight: 5,
      valueHeight: 7,
      items: input.computedFooters.map(footer => ({ footerId: footer.id, width: 1 })),
    };
    input.footerStyle = {
      borderPreset: 'none',
      border: { width: 1, color: '#333333', style: 'solid' },
    };
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const footerCell = output.layout.cells.find(cell => cell.role === 'footer-label')!;
    const footerStartY = footerCell.box.y;

    assert.equal(output.layout.lines.some(line => line.border), false);
    assert.equal(output.layout.lines.some(line =>
      line.from.y > footerStartY || line.to.y > footerStartY
    ), false);
    const precedingBodyBoundary = output.layout.lines.find(line =>
      line.from.y === footerStartY
      && line.to.y === footerStartY
      && line.from.x === 0
    );
    assert.ok(precedingBodyBoundary);
    assert.equal(precedingBodyBoundary.to.x, footerCell.box.x);
  });

  it('keeps the lead label merged while applying all borders to a footer band', () => {
    const input = node();
    input.footerBand = {
      enabled: true,
      label: '合計',
      startColumnKey: 'quantity',
      leadWidth: 1,
      headerHeight: 5,
      valueHeight: 7,
      items: input.computedFooters.map(footer => ({ footerId: footer.id, width: 2 })),
    };
    input.footerStyle = {
      borderPreset: 'all',
      border: { width: 1, color: '#333333', style: 'solid' },
    };
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const lead = output.layout.cells.find(cell => cell.id.endsWith('footer-band-label'))!;
    const internalY = lead.box.y + input.footerBand.headerHeight;
    const internalHorizontal = output.layout.lines.find(line =>
      line.border
      && Math.abs(line.from.y - internalY) < 0.001
      && Math.abs(line.to.y - internalY) < 0.001
    );

    assert.ok(internalHorizontal);
    assert.ok(Math.abs(internalHorizontal.from.x - (lead.box.x + lead.box.width)) < 0.001);
    assert.ok(Math.abs(internalHorizontal.to.x - output.box.width) < 0.001);
  });

  it('keeps thick footer outer strokes inside the clipped table box', () => {
    const input = node();
    input.footerBand = {
      enabled: true,
      label: '合計',
      startColumnKey: 'quantity',
      leadWidth: 1,
      headerHeight: 5,
      valueHeight: 7,
      items: input.computedFooters.map(footer => ({ footerId: footer.id, width: 1 })),
    };
    input.footerStyle = {
      borderPreset: 'all',
      border: { width: 1.5, color: '#111111', style: 'solid' },
    };
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const footerCells = output.layout.cells.filter(cell =>
      cell.role === 'footer-label' || cell.role === 'footer-value'
    );
    const footerStartY = Math.min(...footerCells.map(cell => cell.box.y));
    const footerHalfBorder = pdfPtToMm(input.footerStyle.border.width) / 2;
    const footerLines = output.layout.lines.filter(line => line.border);
    const bottom = footerLines.find(line =>
      Math.abs(line.from.y - line.to.y) < 0.000001
      && Math.abs(line.from.y - (output.layout.height - footerHalfBorder)) < 0.000001
    );
    const right = footerLines.find(line =>
      Math.abs(line.from.x - line.to.x) < 0.000001
      && Math.abs(line.from.x - (output.box.width - footerHalfBorder)) < 0.000001
    );
    const sharedTop = footerLines.find(line =>
      Math.abs(line.from.y - footerStartY) < 0.000001
      && Math.abs(line.to.y - footerStartY) < 0.000001
    );

    assert.ok(bottom);
    assert.ok(right);
    assert.ok(sharedTop);
  });
});

describe('footer fill colors', () => {
  it('inherits header background and color for band lead, leaves footer cells uncolored by default', () => {
    const input = node();
    input.footerBand = {
      enabled: true,
      label: '合計',
      leadWidth: 1,
      headerHeight: 8,
      valueHeight: 7,
      items: input.computedFooters.map(footer => ({ footerId: footer.id, width: 1 })),
    };
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const lead = output.layout.cells.find(cell => cell.id.endsWith('footer-band-label'))!;
    assert.equal(lead.backgroundColor, input.style.headerBackground);
    assert.equal(lead.color, input.style.headerColor);
    const value = output.layout.cells.find(cell => cell.id.endsWith('footer-band-value:footer_total'))!;
    assert.equal(value.backgroundColor, undefined);
    assert.equal(value.color, input.style.bodyColor);
  });

  it('overrides footer band cells when footerStyle.background/color are set', () => {
    const input = node();
    input.footerBand = {
      enabled: true,
      label: '合計',
      leadWidth: 1,
      headerHeight: 8,
      valueHeight: 7,
      items: input.computedFooters.map(footer => ({ footerId: footer.id, width: 1 })),
    };
    input.footerStyle = {
      borderPreset: 'inherit',
      border: { ...input.style.border },
      background: '#112233',
      color: '#ffffff',
    };
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const lead = output.layout.cells.find(cell => cell.id.endsWith('footer-band-label'))!;
    assert.equal(lead.backgroundColor, '#112233');
    assert.equal(lead.color, '#ffffff');
    const header = output.layout.cells.find(cell => cell.id.endsWith('footer-band-header:footer_total'))!;
    assert.equal(header.backgroundColor, '#112233');
    assert.equal(header.color, '#ffffff');
  });

  it('overrides per-row footer cells when footerStyle.background/color are set', () => {
    const input = node();
    input.footerStyle = {
      borderPreset: 'inherit',
      border: { ...input.style.border },
      background: '#445566',
      color: '#abcdef',
    };
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const label = output.layout.cells.find(cell => cell.id.endsWith('footer-label:footer_total'))!;
    const value = output.layout.cells.find(cell => cell.id.endsWith('footer-value:footer_total'))!;
    assert.equal(label.backgroundColor, '#445566');
    assert.equal(label.color, '#abcdef');
    assert.equal(value.backgroundColor, undefined);
    assert.equal(value.color, input.style.bodyColor);
  });

  it('keeps per-row footer cells uncolored by default', () => {
    const input = node();
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const label = output.layout.cells.find(cell => cell.id.endsWith('footer-label:footer_total'))!;
    const value = output.layout.cells.find(cell => cell.id.endsWith('footer-value:footer_total'))!;
    assert.equal(label.backgroundColor, undefined);
    assert.equal(value.backgroundColor, undefined);
    assert.equal(label.color, input.style.bodyColor);
    assert.equal(value.color, input.style.bodyColor);
  });
});

describe('formula error presentation', () => {
  function erroredNode(): TableNode {
    const input = node();
    const amountColumn = input.columns.find(column => column.key === 'amount')!;
    amountColumn.valueType = 'formula';
    input.computedRows[0].amount = FORMULA_ERROR;
    return input;
  }

  it('renders a locale-specific sentinel with the error background for formula columns', () => {
    const output = layoutTablePresentation(erroredNode(), fontManager, jaFormat);
    const cell = output.layout.cells.find(cell =>
      cell.role === 'body' && cell.columnKey === 'amount' && cell.rowIndex === 0
    )!;

    assert.equal(cell.text, formulaErrorText('ja-JP'));
    assert.equal(cell.backgroundColor, FORMULA_ERROR_BACKGROUND);
  });

  it('uses the English placeholder for en-US documents', () => {
    const output = layoutTablePresentation(erroredNode(), fontManager, enFormat);
    const cell = output.layout.cells.find(cell =>
      cell.role === 'body' && cell.columnKey === 'amount' && cell.rowIndex === 0
    )!;

    assert.equal(cell.text, '#Formula Error');
    assert.equal(cell.backgroundColor, FORMULA_ERROR_BACKGROUND);
  });

  it('does not treat a text column with the sentinel literal as an error', () => {
    const input = erroredNode();
    const itemColumn = input.columns.find(column => column.key === 'item')!;
    assert.equal(itemColumn.valueType, 'text');
    input.computedRows[0].item = FORMULA_ERROR;
    const output = layoutTablePresentation(input, fontManager, jaFormat);
    const cell = output.layout.cells.find(cell =>
      cell.role === 'body' && cell.columnKey === 'item' && cell.rowIndex === 0
    )!;

    assert.equal(cell.text, FORMULA_ERROR);
    assert.equal(cell.backgroundColor, undefined);
  });

  it('leaves non-errored formula and number columns uncolored', () => {
    const output = layoutTablePresentation(node(), fontManager, jaFormat);
    const amount = output.layout.cells.find(cell =>
      cell.role === 'body' && cell.columnKey === 'amount' && cell.rowIndex === 0
    )!;
    const unitPrice = output.layout.cells.find(cell =>
      cell.role === 'body' && cell.columnKey === 'unitPrice' && cell.rowIndex === 0
    )!;

    assert.equal(amount.valueType, 'formula');
    assert.equal(amount.backgroundColor, undefined);
    assert.equal(unitPrice.backgroundColor, undefined);
  });
});
