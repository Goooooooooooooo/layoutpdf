import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBlankTemplateFile } from '@/engine/core/document.js';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import { layoutTablePresentation } from '@/engine/renderTree/tablePresentation.js';
import { resolveRenderTree } from '@/engine/renderTree/resolve.js';
import { pluginRegistry } from '@/plugins/index.js';
import { calcPlugin } from '@/plugins/calc/calc.js';
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

function buildInvoice() {
  const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
  const table = tablePlugin.createDefaultElement({ id: 'table_1', position: { x: 10, y: 10 } });
  table.props.columns = [{
    id: 'col_amount',
    label: '金額',
    key: 'amount',
    width: 1,
    valueType: 'number',
    align: 'right',
    decimalPlaces: 2,
  }];
  table.props.footers = [{
    id: 'total',
    label: '合計',
    formula: { kind: 'expression', expression: 'SUM(column.amount)' },
  }];
  table.value = [
    { id: 'row_1', amount: 100.005 },
    { id: 'row_2', amount: 120 },
  ];
  file.template.pages[0].elements.push(table);
  return { file, table };
}

describe('footer and summary decimal places', () => {
  it('defaults footer decimals to the source column and publishes the printed value', () => {
    const { file, table } = buildInvoice();
    const summary = summaryPlugin.createDefaultElement({ id: 'summary_1', position: { x: 10, y: 100 } });
    summary.props.items = [{
      id: 'item_1',
      source: { sourceElementId: table.id, outputId: 'total' },
      labelMode: 'source',
      width: 1,
    }];
    file.template.pages[0].elements.push(summary);

    const resolved = resolveRenderTree({ file, input: {}, plugins: pluginRegistry, fontManager });
    const tableNode = resolved.pages[0].nodes.find(node => node.sourceElementId === table.id);
    const summaryNode = resolved.pages[0].nodes.find(node => node.sourceElementId === summary.id);
    assert.ok(tableNode?.kind === 'table');

    assert.equal(tableNode.computedFooters[0].value, 220.005);
    assert.equal(tableNode.computedFooters[0].decimalPlaces, 2);
    assert.equal(tableNode.outputs?.[0]?.value, 220.01);
    assert.equal(tableNode.outputs?.[0]?.decimalPlaces, 2);

    assert.ok(summaryNode?.kind === 'grid');
    assert.equal(summaryNode.computedCells['0:value'].content, '220.01');

    const laidOut = layoutTablePresentation(tableNode, fontManager, resolved.format);
    const footerValue = laidOut.layout.cells.find(cell => cell.role === 'footer-value');
    assert.equal(footerValue?.text, '220.01');
  });

  it('lets a footer override the source column decimals', () => {
    const { file, table } = buildInvoice();
    table.props.footers[0].decimalPlaces = 0;

    const resolved = resolveRenderTree({ file, input: {}, plugins: pluginRegistry, fontManager });
    const tableNode = resolved.pages[0].nodes.find(node => node.sourceElementId === table.id);
    assert.ok(tableNode?.kind === 'table');

    assert.equal(tableNode.computedFooters[0].decimalPlaces, 0);
    assert.equal(tableNode.outputs?.[0]?.value, 220);
    const laidOut = layoutTablePresentation(tableNode, fontManager, resolved.format);
    assert.equal(laidOut.layout.cells.find(cell => cell.role === 'footer-value')?.text, '220');
  });

  it('publishes the rounded value to formulas that reference the output', () => {
    const { file, table } = buildInvoice();
    const calc = calcPlugin.createDefaultElement({ id: 'calc_1', position: { x: 10, y: 200 } });
    calc.value = createFormulaOutputReference(table.id, 'total');
    calc.props = { ...calc.props, format: 'number', prefix: '', suffix: '', decimalPlaces: 2 };
    file.template.pages[0].elements.push(calc);

    const resolved = resolveRenderTree({ file, input: {}, plugins: pluginRegistry, fontManager });
    const calcNode = resolved.pages[0].nodes.find(node => node.sourceElementId === calc.id);
    assert.ok(calcNode?.kind === 'text');
    assert.equal(calcNode.text, '220.01');
  });

  it('publishes the rounded value to cross-table output references', () => {
    const { file, table } = buildInvoice();
    const consumer = tablePlugin.createDefaultElement({ id: 'table_2', position: { x: 10, y: 100 } });
    consumer.props.columns = [{
      id: 'col_amount',
      label: '金額',
      key: 'amount',
      width: 1,
      valueType: 'number',
      align: 'right',
    }];
    consumer.props.footers = [{
      id: 'total',
      label: '合計',
      formula: {
        kind: 'expression',
        expression: createFormulaOutputReference(table.id, 'total'),
      },
    }];
    consumer.value = [{ id: 'row_1', amount: 0 }];
    file.template.pages[0].elements.push(consumer);

    const resolved = resolveRenderTree({ file, input: {}, plugins: pluginRegistry, fontManager });
    const consumerNode = resolved.pages[0].nodes.find(node => node.sourceElementId === consumer.id);
    assert.ok(consumerNode?.kind === 'table');
    assert.equal(consumerNode.computedFooters[0].value, 220.01);
  });
});
