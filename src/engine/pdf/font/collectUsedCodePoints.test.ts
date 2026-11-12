import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  RenderDocument,
  TextNode,
  TableNode,
  TableColumn,
  TableValueRow,
  ComputedTableFooter,
  GridNode,
  TableLayoutCell,
} from '../../renderTree/model.js';
import {
  collectRenderedText,
  collectUsedCodePoints,
  collectUsedCodePointsByFont,
} from './collectUsedCodePoints.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';

const format = defaultFormatSettingsForLocale('ja-JP');

function emptyDocument(): RenderDocument {
  return { templateId: 't', format, issues: [], pages: [] };
}

function textNode(text: string): TextNode {
  return {
    kind: 'text',
    id: 'n:text',
    sourceElementId: 'e',
    box: { x: 0, y: 0, width: 100, height: 20 },
    rotate: 0, opacity: 1, clip: false, zIndex: 0,
    text,
    style: {
      fontSize: 12, color: '#000', fontWeight: 'normal',
      align: 'left', verticalAlign: 'top', lineHeight: 1.2,
      padding: [0, 0, 0, 0],
    },
    layout: { lines: [{ text, x: 0, y: 0, width: 50 }], lineHeightMm: 5, overflow: false },
  };
}

function tableCell(id: string, text: string, prefixText?: string): TableLayoutCell {
  return {
    id,
    role: 'body',
    box: { x: 0, y: 0, width: 20, height: 8 },
    text,
    textX: 1,
    textY: 1,
    textWidth: 10,
    prefixText,
    prefixTextX: prefixText ? 1 : undefined,
    prefixTextWidth: prefixText ? 2 : undefined,
    lineHeightMm: 4,
    fontSize: 10,
    align: 'left',
    color: '#000000',
    bold: false,
  };
}

describe('collectUsedCodePoints', () => {
  it('includes ASCII range by default on empty document', () => {
    const cps = collectUsedCodePoints(emptyDocument());
    for (let cp = 0x20; cp <= 0x7e; cp++) {
      assert.ok(cps.has(cp), `Missing ASCII 0x${cp.toString(16)} (${String.fromCodePoint(cp)})`);
    }
    assert.ok(cps.has(0x0a));
    assert.ok(cps.has(0x0d));
    assert.ok(cps.has(0x3000));
    assert.ok(cps.has(0x00a0));
    assert.ok(cps.has(0x00a5)); // ¥
  });

  it('extracts code points from text node', () => {
    const doc: RenderDocument = {
      templateId: 't',
      format,
      issues: [],
      pages: [{ id: 'p1', sourcePageId: 'p1', continuationIndex: 0, size: { width: 210, height: 297 }, padding: [0, 0, 0, 0], background: { kind: 'blank' }, nodes: [textNode('Hello世界')] }],
    };
    const cps = collectUsedCodePoints(doc);
    for (const char of 'Hello世界') {
      assert.ok(cps.has(char.codePointAt(0)!), `Missing ${char}`);
    }
  });

  it('partitions final text by the resolved Regular and Bold faces', () => {
    const regular = textNode('正文');
    regular.style.fontName = 'Regular';
    const bold = textNode('标题');
    bold.style.fontName = 'Bold';
    bold.style.fontWeight = 'bold';
    const doc: RenderDocument = {
      templateId: 't',
      format,
      issues: [],
      pages: [{
        id: 'p1',
        sourcePageId: 'p1',
        continuationIndex: 0,
        size: { width: 210, height: 297 },
        padding: [0, 0, 0, 0],
        background: { kind: 'blank' },
        nodes: [regular, bold],
      }],
    };

    const byFont = collectUsedCodePointsByFont(doc, 'Regular');
    assert.ok(byFont.get('Regular')?.has('正'.codePointAt(0)!));
    assert.equal(byFont.get('Regular')?.has('标'.codePointAt(0)!), false);
    assert.ok(byFont.get('Bold')?.has('标'.codePointAt(0)!));
    assert.equal(byFont.get('Bold')?.has('正'.codePointAt(0)!), false);
  });

  it('extracts the final formatted table text instead of raw computed values', () => {
    const columns: TableColumn[] = [
      { id: 'c1', label: '品名', key: 'item', width: 60, valueType: 'text', align: 'left' },
    ];
    const rows: TableValueRow[] = [
      { id: 'r1', item: 'A4用紙', quantity: 3 },
    ];
    const footers: ComputedTableFooter[] = [
      { id: 'f1', label: '合計', value: 3000, bold: true },
    ];
    const node: TableNode = {
      kind: 'table',
      id: 'n:table', sourceElementId: 'e',
      box: { x: 0, y: 0, width: 100, height: 100 },
      rotate: 0, opacity: 1, clip: false, zIndex: 0,
      columns,
      rows,
      computedRows: rows,
      footers: [],
      computedFooters: footers,
      layout: {
        cells: [
          tableCell('header', '品名'),
          tableCell('date', '2026年7月1日'),
          tableCell('footer', '合計', '¥'),
        ],
        lines: [],
        height: 100,
      },
      style: { headerHeight: 10, rowHeight: 8, fontSize: 10, border: { width: 0.5, color: '#000', style: 'solid' }, headerBackground: '#eee', headerColor: '#000', bodyColor: '#000' },
    };
    const doc: RenderDocument = {
      templateId: 't', format, issues: [],
      pages: [{ id: 'p1', sourcePageId: 'p1', continuationIndex: 0, size: { width: 210, height: 297 }, padding: [0, 0, 0, 0], background: { kind: 'blank' }, nodes: [node] }],
    };
    const cps = collectUsedCodePoints(doc);
    for (const char of '品名2026年7月1日合計¥') {
      assert.ok(cps.has(char.codePointAt(0)!), `Missing ${char}`);
    }
    assert.equal(cps.has('紙'.codePointAt(0)!), false);
  });

  it('collects wrapped table lines instead of the unlaid-out source cell string', () => {
    const cell = tableCell('wrapped', 'source text');
    cell.lines = [
      { text: '折返し', x: 1, y: 1, width: 8 },
      { text: '明細', x: 1, y: 5, width: 6 },
    ];
    const node: TableNode = {
      kind: 'table',
      id: 'n:table', sourceElementId: 'e',
      box: { x: 0, y: 0, width: 100, height: 20 },
      rotate: 0, opacity: 1, clip: false, zIndex: 0,
      columns: [], rows: [], computedRows: [], footers: [], computedFooters: [],
      layout: { cells: [cell], lines: [], height: 20 },
      style: { headerHeight: 8, rowHeight: 8, fontSize: 10, border: { width: 0.5, color: '#000', style: 'solid' }, headerBackground: '#eee', headerColor: '#000', bodyColor: '#000' },
    };
    const doc: RenderDocument = {
      templateId: 't', format, issues: [],
      pages: [{ id: 'p1', sourcePageId: 'p1', continuationIndex: 0, size: { width: 210, height: 297 }, padding: [0, 0, 0, 0], background: { kind: 'blank' }, nodes: [node] }],
    };

    assert.deepEqual(collectRenderedText(doc), ['折返し', '明細']);
  });

  it('extracts code points from final grid layout lines', () => {
    const node: GridNode = {
      kind: 'grid',
      id: 'n:grid', sourceElementId: 'e',
      box: { x: 0, y: 0, width: 100, height: 20 },
      rotate: 0, opacity: 1, clip: true, zIndex: 0,
      columns: [{ id: 'c1', key: 'a', width: 1 }],
      rows: [{ id: 'r1' }],
      cells: { '0:a': { content: '=1', role: 'body' } },
      computedCells: {
        '0:a': {
          content: '請求書',
          prefixText: '€',
          role: 'body',
        },
      },
      layout: {
        cells: [{
          id: '0:a',
          role: 'body',
          box: { x: 0, y: 0, width: 20, height: 8 },
          lines: [{ text: '請求書', x: 1, y: 1, width: 10 }],
          prefixLines: [{ text: '€', x: 1, y: 1, width: 2 }],
          lineHeightMm: 4,
          fontSize: 10,
          align: 'left',
          color: '#000000',
          bold: false,
          overflow: false,
          borders: { top: true, bottom: true, left: true, right: true },
        }],
        lines: [],
        height: 8,
      },
      style: { headerHeight: 8, rowHeight: 8, fontSize: 10, border: { width: 0.5, color: '#000', style: 'solid' } },
    };
    const doc: RenderDocument = {
      templateId: 't', format, issues: [],
      pages: [{ id: 'p1', sourcePageId: 'p1', continuationIndex: 0, size: { width: 210, height: 297 }, padding: [0, 0, 0, 0], background: { kind: 'blank' }, nodes: [node] }],
    };
    const cps = collectUsedCodePoints(doc);
    for (const char of '請求書€') assert.ok(cps.has(char.codePointAt(0)!));
  });

  it('returns unique non-empty rendered text runs', () => {
    const doc: RenderDocument = {
      templateId: 't',
      format,
      issues: [],
      pages: [{
        id: 'p1',
        sourcePageId: 'p1',
        continuationIndex: 0,
        size: { width: 210, height: 297 },
        padding: [0, 0, 0, 0],
        background: { kind: 'blank' },
        nodes: [textNode('same'), textNode('same'), textNode('')],
      }],
    };
    assert.deepEqual(collectRenderedText(doc), ['same']);
  });

  it('handles surrogate pair code points', () => {
    const doc: RenderDocument = {
      templateId: 't', format, issues: [],
      pages: [{ id: 'p1', sourcePageId: 'p1', continuationIndex: 0, size: { width: 210, height: 297 }, padding: [0, 0, 0, 0], background: { kind: 'blank' }, nodes: [textNode('𠀋')] }],
    };
    const cps = collectUsedCodePoints(doc);
    // U+2000B 𠀋 — surrogate pair
    assert.ok(cps.has(0x2000B), 'Missing U+2000B');
  });

  it('handles empty text gracefully', () => {
    const doc: RenderDocument = {
      templateId: 't', format, issues: [],
      pages: [{ id: 'p1', sourcePageId: 'p1', continuationIndex: 0, size: { width: 210, height: 297 }, padding: [0, 0, 0, 0], background: { kind: 'blank' }, nodes: [textNode('')] }],
    };
    const cps = collectUsedCodePoints(doc);
    // only defaults should be present
    assert.equal(cps.size, 0x7e - 0x20 + 1 + 5); // ASCII 95 + 4 whitespace + ¥
  });
});
