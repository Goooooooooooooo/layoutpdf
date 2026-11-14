import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FontManager } from '../pdf/font/fontManager.js';
import type { RenderDocument, TableNode, TextNode } from './model.js';
import { tablePlugin } from '../../plugins/table/table.js';
import { layoutRenderTree } from './layout.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';
import { computeProducerNodes } from '@/engine/renderTree/outputReferences.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'TestFont',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: (_name, text) => {
    if (text.includes('!unsupported!')) throw new Error('missing glyph');
  },
  measureText: (_name, text, size) => text.length * size,
  ensureBrowserFont: async () => 'TestFont',
};

const format = defaultFormatSettingsForLocale('ja-JP');

function documentWith(node: TextNode): RenderDocument {
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
      background: { kind: 'blank' },
      nodes: [node],
    }],
  };
}

function node(text: string, width = 100): TextNode {
  return {
    kind: 'text',
    id: 'el_1:node:text',
    sourceElementId: 'el_1',
    box: { x: 10, y: 10, width, height: 10 },
    rotate: 0,
    opacity: 1,
    clip: true,
    zIndex: 0,
    text,
    style: {
      fontSize: 12,
      color: '#000',
      fontWeight: 'normal',
      align: 'left',
      verticalAlign: 'top',
      lineHeight: 1.2,
      padding: [0, 0, 0, 0],
    },
    layout: { lines: [], lineHeightMm: 0, overflow: false },
  };
}

describe('layoutRenderTree', () => {
  it('lays out text without mutating the resolved document', () => {
    const input = documentWith(node('Hello'));
    const before = structuredClone(input);
    const output = layoutRenderTree(input, { fontManager });

    assert.equal(output.pages[0].nodes[0].kind === 'text' ? output.pages[0].nodes[0].layout.lines.length : 0, 1);
    assert.deepEqual(input, before);
  });

  it('adds an overflow warning with page and element location', () => {
    const output = layoutRenderTree(documentWith(node('Long text', 1)), { fontManager });
    assert.ok(output.issues.some(issue =>
      issue.code === 'TEXT_OVERFLOW' && issue.pageId === 'page_1' && issue.elementId === 'el_1'
    ));
  });

  it('captures font and text layout failures as structured errors', () => {
    const output = layoutRenderTree(documentWith(node('!unsupported!')), { fontManager });
    assert.ok(output.issues.some(issue => issue.code === 'TEXT_LAYOUT_FAILED' && issue.message === 'missing glyph'));
  });

  it('does not duplicate layout issues when layout is recomputed', () => {
    const first = layoutRenderTree(documentWith(node('Long text', 1)), { fontManager });
    const second = layoutRenderTree(first, { fontManager });
    assert.equal(second.issues.filter(issue => issue.code === 'TEXT_OVERFLOW').length, 1);
  });

  it('reports partial and complete page boundary violations', () => {
    const partial = documentWith(node('Partial'));
    partial.pages[0].nodes[0].box.x = 205;
    const partialOutput = layoutRenderTree(partial, { fontManager });
    assert.ok(partialOutput.issues.some(issue => issue.code === 'ELEMENT_OVERFLOW_PAGE'));

    const outside = documentWith(node('Outside'));
    outside.pages[0].nodes[0].box.x = 220;
    const outsideOutput = layoutRenderTree(outside, { fontManager });
    assert.ok(outsideOutput.issues.some(issue =>
      issue.code === 'ELEMENT_OUTSIDE_PAGE' && issue.severity === 'error'
    ));
  });

  it('paginates a table computed by the resolve producer phase', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 280 } });
    const value = Array.from({ length: 20 }, (_, index) => ({
      id: `row_${index}`,
      item: `Item ${index}`,
      quantity: 2,
      unitPrice: 100,
    }));
    const table = tablePlugin.buildRenderNodes({
      element,
      value,
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager,
        format,
        createNodeId: localId => `el_table:node:${localId}`,
        report: () => {},
      },
    })[0];
    const input: RenderDocument = {
      templateId: 'tpl_1',
      format,
      issues: [],
      pages: [{
        id: 'page_1',
        sourcePageId: 'page_1',
        continuationIndex: 0,
        size: { width: 210, height: 297 },
        padding: [10, 10, 10, 10],
        background: { kind: 'blank' },
        nodes: [table],
      }],
    };

    const output = layoutRenderTree(computeProducerNodes(input), { fontManager });
    assert.ok(output.pages.length > 1);
    assert.deepEqual(output.pages[0].nodes, []);
    const firstFragment = output.pages[1].nodes[0];
    assert.equal(firstFragment.kind, 'table');
    assert.equal(firstFragment.kind === 'table' && firstFragment.computedRows[0].amount, 200);
    const lastFragment = output.pages.at(-1)!.nodes[0];
    assert.equal(lastFragment.kind === 'table' && lastFragment.fragment?.includeFooter, true);
    assert.equal(lastFragment.kind === 'table' && lastFragment.computedFooters[2].value, 4400);
  });

  it('measures and lays out a synthesized continuation title through the text backend', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 280 } });
    element.box.width = 45;
    element.props.pagination = {
      ...element.props.pagination!,
      continuation: { title: 'Details continued across pages', showFragmentIndex: true },
    };
    const value = Array.from({ length: 8 }, (_, index) => ({
      id: `row_${index}`,
      item: `Item ${index}`,
      quantity: 2,
      unitPrice: 100,
    }));
    const table = tablePlugin.buildRenderNodes({
      element,
      value,
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager,
        format,
        createNodeId: localId => `el_table:node:${localId}`,
        report: () => {},
      },
    })[0];
    const input: RenderDocument = {
      templateId: 'tpl_1',
      format,
      issues: [],
      pages: [{
        id: 'page_1',
        sourcePageId: 'page_1',
        continuationIndex: 0,
        size: { width: 210, height: 297 },
        padding: [10, 10, 10, 10],
        background: { kind: 'blank' },
        nodes: [table],
      }],
    };

    const output = layoutRenderTree(computeProducerNodes(input), { fontManager });
    const title = output.pages[1].nodes.find(node =>
      node.kind === 'text' && node.runtimeRole === 'table-continuation-title'
    );
    assert.ok(title?.kind === 'text');
    assert.ok(title.layout.lines.length > 1);
    assert.equal(title.layout.overflow, false);
    const continuedTable = output.pages[1].nodes.find(node => node.kind === 'table');
    assert.ok(continuedTable);
    assert.ok(continuedTable.box.y >= title.box.y + title.box.height);
  });

  it('measures wrapped table rows before choosing pagination fragments', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 250 } });
    element.box.width = 60;
    element.props.columns = [{
      id: 'description',
      label: 'Description',
      key: 'description',
      width: 1,
      valueType: 'text',
      align: 'left',
    }];
    element.props.footers = [];
    const value = Array.from({ length: 3 }, (_, index) => ({
      id: `row_${index}`,
      description: `Detailed service description number ${index + 1}`,
    }));
    const table = tablePlugin.buildRenderNodes({
      element,
      value,
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager,
        format,
        createNodeId: localId => `el_table:node:${localId}`,
        report: () => {},
      },
    })[0];
    const input: RenderDocument = {
      templateId: 'tpl_1',
      format,
      issues: [],
      pages: [{
        id: 'page_1',
        sourcePageId: 'page_1',
        continuationIndex: 0,
        size: { width: 210, height: 297 },
        padding: [10, 10, 10, 10],
        background: { kind: 'blank' },
        nodes: [table],
      }],
    };

    const output = layoutRenderTree(computeProducerNodes(input), { fontManager });
    assert.equal(output.pages.length, 2);
    const first = output.pages[0].nodes[0];
    const continued = output.pages[1].nodes[0];
    assert.equal(first.kind, 'table');
    assert.equal(continued.kind, 'table');
    if (first.kind === 'table' && continued.kind === 'table') {
      assert.ok(first.rowHeights?.every(height => height > first.style.rowHeight));
      assert.deepEqual(first.fragment && [first.fragment.rowStart, first.fragment.rowEnd], [0, 1]);
      assert.deepEqual(continued.fragment && [continued.fragment.rowStart, continued.fragment.rowEnd], [1, 3]);
      assert.ok(first.layout.cells.some(cell => (cell.lines?.length ?? 0) > 1));
      assert.ok(continued.layout.cells.some(cell => (cell.lines?.length ?? 0) > 1));
    }
  });

  it('keeps the template static when pagination is disabled', () => {
    const source: TableNode = {
      kind: 'table',
      id: 'el_table:node:table',
      sourceElementId: 'el_table',
      box: { x: 10, y: 60, width: 80, height: 20 },
      rotate: 0,
      opacity: 1,
      clip: true,
      zIndex: 0,
      columns: [{ id: 'amount', label: '金額', key: 'amount', width: 1, valueType: 'currency', align: 'right' }],
      rows: [],
      computedRows: Array.from({ length: 20 }, (_, index) => ({ id: `row_${index}`, amount: index + 1 })),
      footers: [{ id: 'total', label: '合計', formula: { kind: 'expression', expression: 'SUM(column.amount)' } }],
      computedFooters: [{ id: 'total', label: '合計', value: 210, bold: true }],
      layout: { cells: [], lines: [], height: 0 },
      style: {
        headerHeight: 8,
        rowHeight: 7,
        fontSize: 10,
        border: { width: 0.5, color: '#cccccc', style: 'solid' },
        headerBackground: '#eeeeee',
        headerColor: '#000000',
        bodyColor: '#333333',
      },
      pagination: {
        finalElementIds: ['el_group'],
        repeatElementIds: [],
        ignoreElementIds: [],
        rowMode: 'compact',
        minRowsOnLastPage: 1,
        gapAfterTable: 3,
      },
    };
    const group = {
      kind: 'rect' as const,
      id: 'el_group:node:rect',
      sourceElementId: 'el_group',
      box: { x: 10, y: 90, width: 40, height: 6 },
      rotate: 0,
      opacity: 1,
      clip: false,
      zIndex: 0,
      fill: '#000000',
    };
    const input: RenderDocument = {
      templateId: 'tpl_1',
      format,
      issues: [],
      pages: [{
        id: 'page_1',
        sourcePageId: 'page_1',
        continuationIndex: 0,
        size: { width: 210, height: 297 },
        padding: [10, 10, 10, 10],
        background: { kind: 'blank' },
        nodes: [source, group],
      }],
    };

    const output = layoutRenderTree(input, { fontManager }, { paginate: false });
    assert.equal(output.pages.length, 1);
    assert.deepEqual(output.pages[0].nodes.map(node => node.kind), ['table', 'rect']);
    const rect = output.pages[0].nodes[1];
    assert.equal(rect.kind === 'rect' && rect.box.y, 90);
  });

  it('warns once when numeric and footer cells are silently truncated', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 10 } });
    element.box.width = 24;
    element.box.height = 40;
    element.props.columns = [{
      id: 'amount',
      label: '金額',
      key: 'amount',
      width: 1,
      valueType: 'currency',
      align: 'right',
    }];
    element.props.footers = [{
      id: 'total',
      label: '非常に長い合計ラベルです',
      formula: { kind: 'expression', expression: 'SUM(column.amount)' },
      valueColumnKey: 'amount',
    }];
    const table = tablePlugin.buildRenderNodes({
      element,
      value: [{ id: 'row_1', amount: 123456789012345 }],
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager,
        format,
        createNodeId: localId => `el_table:node:${localId}`,
        report: () => {},
      },
    })[0];
    const input: RenderDocument = {
      templateId: 'tpl_1',
      format,
      issues: [],
      pages: [{
        id: 'page_1',
        sourcePageId: 'page_1',
        continuationIndex: 0,
        size: { width: 210, height: 297 },
        padding: [10, 10, 10, 10],
        background: { kind: 'blank' },
        nodes: [table],
      }],
    };

    const output = layoutRenderTree(computeProducerNodes(input), { fontManager }, { paginate: false });
    const warnings = output.issues.filter(issue => issue.code === 'TABLE_CELL_OVERFLOW');
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].severity, 'warning');
    assert.equal(warnings[0].elementId, 'el_table');
    const laidOut = output.pages[0].nodes[0];
    assert.ok(laidOut.kind === 'table');
    assert.ok(laidOut.layout.cells.some(cell => cell.truncated));

    const again = layoutRenderTree(output, { fontManager }, { paginate: false });
    assert.equal(again.issues.filter(issue => issue.code === 'TABLE_CELL_OVERFLOW').length, 1);
  });
});
