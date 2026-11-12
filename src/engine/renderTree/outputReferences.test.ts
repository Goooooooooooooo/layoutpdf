import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBlankTemplateFile } from '@/engine/core/document.js';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import { layoutRenderTree } from '@/engine/renderTree/layout.js';
import type { RenderDocument, TextNode } from '@/engine/renderTree/model.js';
import { resolveOutputBindings } from '@/engine/renderTree/outputReferences.js';
import { resolveRenderTree } from '@/engine/renderTree/resolve.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';
import { pluginRegistry } from '@/plugins/index.js';
import { summaryPlugin } from '@/plugins/summary/summary.js';
import { tablePlugin } from '@/plugins/table/table.js';
import { createFormulaOutputReference } from '@/utils/calc.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: (_font, text, size) => text.length * size * 0.5,
  ensureBrowserFont: async () => 'default',
};

describe('element output references', () => {
  it('publishes table footer outputs and resolves edge prefixes into runtime grid cells', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    const page = file.template.pages[0];
    const table = tablePlugin.createDefaultElement({ id: 'table_1', position: { x: 10, y: 10 } });
    table.props.footers[2].numericFormat = {
      prefix: '¥',
      symbolLayout: 'edge',
      zeroDisplay: 'zero',
      emptyDisplay: 'blank',
    };
    table.value = [{ id: 'row_1', item: 'Example', quantity: 2, unitPrice: 100 }];
    const summary = summaryPlugin.createDefaultElement({ id: 'summary_1', position: { x: 10, y: 100 } });
    summary.props.items = [{
      id: 'item_1',
      source: { sourceElementId: table.id, outputId: table.props.footers[2].id },
      labelMode: 'source',
      width: 1,
    }];
    page.elements.push(table, summary);

    const resolved = resolveRenderTree({ file, input: {}, plugins: pluginRegistry, fontManager });
    const tableNode = resolved.pages[0].nodes.find(node => node.sourceElementId === table.id);
    const summaryNode = resolved.pages[0].nodes.find(node => node.sourceElementId === summary.id);
    assert.equal(tableNode?.kind, 'table');
    assert.deepEqual(tableNode?.outputs?.map(output => output.id), table.props.footers.map(footer => footer.id));
    assert.equal(summaryNode?.kind === 'grid' && summaryNode.computedCells['0:label'].content, '合計');
    assert.equal(summaryNode?.kind === 'grid' && summaryNode.computedCells['0:value'].content, '220');
    assert.equal(summaryNode?.kind === 'grid' && summaryNode.computedCells['0:value'].prefixText, '¥');

    const laidOut = layoutRenderTree(resolved, { fontManager });
    const laidOutSummary = laidOut.pages[0].nodes.find(node => node.sourceElementId === summary.id);
    assert.ok(laidOutSummary?.kind === 'grid' && laidOutSummary.layout.cells[1].prefixLines?.length);
  });

  it('reports missing sources and outputs with stable diagnostic values', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    const summary = summaryPlugin.createDefaultElement({ id: 'summary_1', position: { x: 0, y: 0 } });
    summary.props.items = [{
      id: 'item_1',
      source: { sourceElementId: 'missing_table', outputId: 'missing_footer' },
      labelMode: 'source',
      width: 1,
    }];
    file.template.pages[0].elements.push(summary);
    const resolved = resolveRenderTree({ file, input: {}, plugins: pluginRegistry, fontManager });
    const issue = resolved.issues.find(candidate => candidate.code === 'MISSING_ELEMENT_OUTPUT_SOURCE');
    assert.deepEqual(issue?.values, {
      sourceElementId: 'missing_table',
      outputId: 'missing_footer',
    });
  });

  it('resolves table formula dependencies across template pages regardless of page order', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    const firstPage = file.template.pages[0];
    const secondPage: typeof firstPage = {
      ...firstPage,
      id: 'page_2',
      elements: [],
    };
    file.template.pages.push(secondPage);
    const consumer = tablePlugin.createDefaultElement({
      id: 'consumer_table',
      position: { x: 10, y: 10 },
    });
    const producer = tablePlugin.createDefaultElement({
      id: 'producer_table',
      position: { x: 10, y: 10 },
    });
    consumer.value = [{ id: 'consumer_row', item: 'Consumer', quantity: 1, unitPrice: 50 }];
    producer.value = [{ id: 'producer_row', item: 'Producer', quantity: 2, unitPrice: 100 }];
    consumer.props.footers[0].formula.expression = [
      createFormulaOutputReference(producer.id, producer.props.footers[0].id),
      ' + SUM(column.amount)',
    ].join('');
    firstPage.elements.push(consumer);
    secondPage.elements.push(producer);

    const resolved = resolveRenderTree({ file, input: {}, plugins: pluginRegistry, fontManager });
    const consumerNode = resolved.pages[0].nodes.find(node => node.sourceElementId === consumer.id);
    const producerNode = resolved.pages[1].nodes.find(node => node.sourceElementId === producer.id);

    assert.equal(producerNode?.kind === 'table' && producerNode.computedFooters[0].value, 200);
    assert.equal(consumerNode?.kind === 'table' && consumerNode.computedFooters[0].value, 250);
    assert.equal(
      resolved.issues.some(issue =>
        issue.code === 'INVALID_FORMULA' && issue.elementId === consumer.id
      ),
      false,
    );
  });

  it('publishes locatable TABLE_FORMULA_EVALUATION_FAILED issues for row and footer errors', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    const table = tablePlugin.createDefaultElement({ id: 'table_1', position: { x: 10, y: 10 } });
    table.props.columns = [
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
    table.props.footers = [
      { id: 'errored_total', label: '错误合计', formula: { kind: 'expression', expression: 'SUM(column.x)' } },
      { id: 'independent_total', label: '独立合计', formula: { kind: 'expression', expression: 'SUM(column.input)' } },
    ];
    table.value = [{ id: 'row_1', input: 2 }];
    file.template.pages[0].elements.push(table);

    const resolved = resolveRenderTree({ file, input: {}, plugins: pluginRegistry, fontManager });
    const tableNode = resolved.pages[0].nodes.find(node => node.sourceElementId === table.id);

    const rowIssue = resolved.issues.find(candidate =>
      candidate.code === 'TABLE_FORMULA_EVALUATION_FAILED' && candidate.values?.columnKey === 'x'
    );
    assert.equal(rowIssue?.severity, 'error');
    assert.equal(rowIssue?.elementId, table.id);
    assert.deepEqual(rowIssue?.values, {
      formulaTarget: 'row',
      rowId: 'row_1',
      rowIndex: 0,
      rowNumber: 1,
      columnKey: 'x',
      columnLabel: 'X',
      detail: 'Formula result is not finite.',
    });

    const footerIssue = resolved.issues.find(candidate =>
      candidate.code === 'TABLE_FORMULA_EVALUATION_FAILED' && candidate.values?.footerId === 'errored_total'
    );
    assert.equal(footerIssue?.severity, 'error');
    assert.equal(footerIssue?.elementId, table.id);
    assert.deepEqual(footerIssue?.values, {
      formulaTarget: 'footer',
      footerId: 'errored_total',
      footerLabel: '错误合计',
      detail: 'column.x is not numeric.',
    });

    assert.deepEqual(tableNode?.outputs?.map(output => output.id), ['independent_total']);
  });

  it('detects duplicate runtime outputs from the same source element', () => {
    const text: TextNode = {
      kind: 'text',
      id: 'node_1',
      sourceElementId: 'source_1',
      box: { x: 0, y: 0, width: 10, height: 10 },
      rotate: 0,
      opacity: 1,
      clip: true,
      zIndex: 0,
      text: '',
      outputs: [
        { id: 'same', kind: 'number', label: 'A', value: 1 },
        { id: 'same', kind: 'number', label: 'B', value: 2 },
      ],
      style: {
        fontSize: 10,
        color: '#000000',
        fontWeight: 'normal',
        align: 'left',
        verticalAlign: 'top',
        lineHeight: 1.2,
        padding: [0, 0, 0, 0],
      },
      layout: { lines: [], lineHeightMm: 0, overflow: false },
    };
    const document: RenderDocument = {
      templateId: 'tpl_1',
      format: defaultFormatSettingsForLocale('en-US'),
      pages: [{
        id: 'page_1',
        sourcePageId: 'page_1',
        continuationIndex: 0,
        size: { width: 210, height: 297 },
        padding: [10, 10, 10, 10],
        background: { kind: 'blank' },
        nodes: [text],
      }],
      issues: [],
    };
    const resolved = resolveOutputBindings(document);
    assert.equal(resolved.issues.filter(issue => issue.code === 'DUPLICATE_RENDER_OUTPUT').length, 1);
  });
});
