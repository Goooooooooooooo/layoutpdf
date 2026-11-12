import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RenderDocument, TableNode, TextNode } from '@/engine/renderTree/model.js';
import { resolveFieldReferences } from '@/engine/renderTree/fieldReferences.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';
import { createFormulaOutputReference } from '@/utils/calc.js';

function table(): TableNode {
  return {
    kind: 'table', id: 'table', sourceElementId: 'el_table',
    box: { x: 0, y: 0, width: 100, height: 20 }, rotate: 0, opacity: 1, clip: true, zIndex: 0,
    columns: [{ id: 'amount', label: '金额', key: 'amount', width: 1, valueType: 'number', align: 'right' }],
    rows: [{ id: 'row', amount: 24444 }], computedRows: [],
    footers: [{
      id: 'total', label: '合计', formula: { kind: 'expression', expression: 'SUM(column.amount)' },
      outputFieldKey: 'invoiceTotal',
    }],
    computedFooters: [], layout: { cells: [], lines: [], height: 0 },
    style: {
      headerHeight: 8, rowHeight: 7, fontSize: 10,
      border: { width: 0.5, color: '#000000', style: 'solid' },
      headerBackground: '#eeeeee', headerColor: '#000000', bodyColor: '#000000',
    },
  };
}

function reference(): TextNode {
  return {
    kind: 'text', id: 'currency', sourceElementId: 'el_currency',
    box: { x: 0, y: 30, width: 30, height: 10 }, rotate: 0, opacity: 1, clip: true, zIndex: 1,
    text: '', fieldReference: { key: 'invoiceTotal', prefix: '¥', suffix: '', decimalPlaces: 0 },
    style: {
      fontSize: 10, color: '#000000', fontWeight: 'normal', align: 'right', verticalAlign: 'middle',
      lineHeight: 1.2, padding: [0, 0, 0, 0],
    },
    layout: { lines: [], lineHeightMm: 0, overflow: false },
  };
}

function formulaReference(expression: string): TextNode {
  return {
    ...reference(),
    id: 'calc',
    sourceElementId: 'el_calc',
    fieldReference: undefined,
    numericFormula: {
      expression,
      format: 'currency',
      prefix: '¥',
      suffix: '',
      decimalPlaces: 0,
    },
  };
}

function document(): RenderDocument {
  return {
    templateId: 'template', format: defaultFormatSettingsForLocale('ja-JP'), issues: [],
    pages: [{
      id: 'page', sourcePageId: 'page', continuationIndex: 0,
      size: { width: 210, height: 297 }, padding: [10, 10, 10, 10], background: { kind: 'blank' },
      nodes: [table(), reference()],
    }],
  };
}

describe('resolveFieldReferences', () => {
  it('publishes a footer result and resolves a Currency field reference', () => {
    const output = resolveFieldReferences(document(), {});
    const currency = output.pages[0].nodes[1];
    assert.equal(currency.kind === 'text' && currency.text, '¥24,444');
    assert.deepEqual(output.issues, []);
  });

  it('reports input conflicts instead of silently overriding values', () => {
    const output = resolveFieldReferences(document(), { invoiceTotal: 1 });
    assert.ok(output.issues.some(issue => issue.code === 'DERIVED_FIELD_CONFLICT'));
  });

  it('lets calculation controls consume table outputs through the shared field scope', () => {
    const input = document();
    input.pages[0].nodes[1] = formulaReference(
      `${createFormulaOutputReference('el_table', 'total')} * field.exchangeRate`,
    );

    const output = resolveFieldReferences(input, { exchangeRate: 1.5 });
    const calc = output.pages[0].nodes[1];

    assert.equal(calc.kind === 'text' && calc.text, '¥36,666');
    assert.deepEqual(output.issues, []);
  });

  it('computes table dependencies independently from visual order', () => {
    const consumer: TableNode = {
      ...table(),
      id: 'consumer',
      sourceElementId: 'el_consumer',
      columns: [
        { id: 'factor', label: '倍数', key: 'factor', width: 1, valueType: 'number', align: 'right' },
        {
          id: 'result',
          label: '结果',
          key: 'result',
          width: 1,
          valueType: 'formula',
          align: 'right',
          formula: {
            kind: 'expression',
            expression: `${createFormulaOutputReference('el_table', 'total')} * row.factor`,
          },
        },
      ],
      rows: [{ id: 'row', factor: 2 }],
      footers: [],
    };
    const input = document();
    input.pages[0].nodes = [consumer, table()];

    const output = resolveFieldReferences(input, {});
    const computedConsumer = output.pages[0].nodes[0];

    assert.equal(
      computedConsumer.kind === 'table' && computedConsumer.computedRows[0].result,
      48_888,
    );
    assert.deepEqual(output.issues, []);
  });

  it('reports unresolved formulas without throwing or publishing stale values', () => {
    const input = document();
    input.pages[0].nodes[1] = formulaReference('field.missing + 1');

    const output = resolveFieldReferences(input, {});
    const calc = output.pages[0].nodes[1];

    assert.equal(calc.kind === 'text' && calc.text, '');
    assert.ok(output.issues.some(issue => issue.code === 'INVALID_FORMULA'));
  });
});
