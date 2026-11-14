import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FORMULA_ERROR, type TableNode } from './model.js';
import {
  computeTableFooters,
  computeTableFootersResult,
  computeTableNode,
  computeTableRows,
  computeTableRowsResult,
} from './tableLayout.js';

function tableNode(): TableNode {
  return {
    kind: 'table',
    id: 'el_table:node:table',
    sourceElementId: 'el_table',
    box: { x: 10, y: 20, width: 180, height: 80 },
    rotate: 0,
    opacity: 1,
    clip: true,
    zIndex: 0,
    columns: [
      { id: 'quantity', label: '数量', key: 'quantity', width: 1, valueType: 'number', align: 'right' },
      { id: 'price', label: '単価', key: 'price', width: 1, valueType: 'currency', align: 'right' },
      {
        id: 'subtotal',
        label: '金額',
        key: 'subtotal',
        width: 1,
        valueType: 'formula',
        align: 'right',
        formula: { kind: 'expression', expression: 'row.quantity * row.price' },
      },
      {
        id: 'adjusted',
        label: '調整後',
        key: 'adjusted',
        width: 1,
        valueType: 'formula',
        align: 'right',
        formula: { kind: 'expression', expression: 'row.subtotal + row.price' },
      },
    ],
    rows: [
      { id: 'row_1', quantity: 2, price: 100 },
      { id: 'row_2', quantity: '3', price: 200 },
    ],
    computedRows: [],
    footers: [
      { id: 'subtotal', label: '小計', formula: { kind: 'expression', expression: 'SUM(column.subtotal)' } },
      { id: 'tax', label: '税', formula: { kind: 'expression', expression: 'footer.subtotal * 0.1' } },
      { id: 'total', label: '合計', formula: { kind: 'expression', expression: 'footer.subtotal + footer.tax' }, bold: true },
    ],
    computedFooters: [],
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
  };
}

describe('table layout calculations', () => {
  it('computes row formulas in column order without mutating raw rows', () => {
    const node = tableNode();
    const before = structuredClone(node.rows);
    const rows = computeTableRows(node.columns, node.rows);

    assert.equal(rows[0].subtotal, 200);
    assert.equal(rows[0].adjusted, 300);
    assert.equal(rows[1].subtotal, 600);
    assert.deepEqual(node.rows, before);
  });

  it('computes footer references independently from display order', () => {
    const node = tableNode();
    const rows = computeTableRows(node.columns, node.rows);
    const footers = computeTableFooters([
      node.footers[2],
      node.footers[1],
      node.footers[0],
    ], rows);

    assert.deepEqual(footers.map(footer => footer.value), [880, 80, 800]);
    assert.equal(footers[0].bold, true);
  });

  it('computes percentage directly from a column and can include the source total', () => {
    const node = tableNode();
    const rows = computeTableRows(node.columns, node.rows);
    const footers = computeTableFooters([
      {
        id: 'tax_direct',
        label: '税',
        formula: { kind: 'expression', expression: 'SUM(column.subtotal) * 0.1' },
      },
      {
        id: 'tax_inclusive',
        label: '税込合計',
        formula: { kind: 'expression', expression: 'SUM(column.subtotal) * 1.1' },
      },
    ], rows);

    assert.equal(footers[0].value, 80);
    assert.ok(Math.abs(footers[1].value - 880) < Number.EPSILON * 1000);
  });

  it('uses directional rounding in row and footer formulas', () => {
    const rows = computeTableRows([
      { id: 'amount', label: '金额', key: 'amount', width: 1, valueType: 'number', align: 'right' },
      {
        id: 'discount',
        label: '折扣',
        key: 'discount',
        width: 1,
        valueType: 'formula',
        align: 'right',
        formula: {
          kind: 'expression',
          expression: 'ROUNDDOWN(row.amount * PERCENT(10), 0)',
        },
      },
    ], [
      { id: 'row_1', amount: 109 },
      { id: 'row_2', amount: 205 },
    ]);
    const footers = computeTableFooters([{
      id: 'tax',
      label: '税',
      formula: {
        kind: 'expression',
        expression: 'ROUNDUP(SUM(column.amount) * PERCENT(10), 0)',
      },
    }], rows);

    assert.deepEqual(rows.map(row => row.discount), [10, 20]);
    assert.equal(footers[0].value, 32);
  });

  it('treats an empty footer sum as zero while sources are being configured', () => {
    const footers = computeTableFooters([{
      id: 'total',
      label: '合计',
      formula: { kind: 'expression', expression: '0' },
    }], []);

    assert.equal(footers[0].value, 0);
  });

  it('returns an independent computed table node', () => {
    const node = tableNode();
    const before = structuredClone(node);
    const computed = computeTableNode(node);

    assert.equal(computed.computedRows[0].subtotal, 200);
    assert.equal(computed.computedFooters[2].value, 880);
    assert.deepEqual(node, before);
  });

  it('uses the shared expression engine for row fields and running totals', () => {
    const columns = [
      { id: 'debit', label: '借方', key: 'debit', width: 1, valueType: 'number' as const, align: 'right' as const },
      { id: 'credit', label: '贷方', key: 'credit', width: 1, valueType: 'number' as const, align: 'right' as const },
      {
        id: 'balance',
        label: '余额',
        key: 'balance',
        width: 1,
        valueType: 'formula' as const,
        align: 'right' as const,
        formula: {
          kind: 'expression' as const,
          expression: 'field.openingBalance + RUNNING_SUM(row.debit - row.credit)',
        },
      },
    ];
    const rows = computeTableRows(columns, [
      { id: 'row_1', debit: 200, credit: 50 },
      { id: 'row_2', debit: 100, credit: 20 },
    ], { openingBalance: 1000 });

    assert.deepEqual(rows.map(row => row.balance), [1150, 1230]);
  });

  it('uses column, footer, and external field references in footer expressions', () => {
    const rows = [
      { id: 'row_1', amount: 100 },
      { id: 'row_2', amount: 200 },
    ];
    const footers = computeTableFooters([
      {
        id: 'subtotal',
        label: '小计',
        formula: { kind: 'expression', expression: 'SUM(column.amount)' },
      },
      {
        id: 'total',
        label: '含税合计',
        formula: {
          kind: 'expression',
          expression: 'footer.subtotal * (1 + field.taxRate)',
        },
      },
    ], rows, { taxRate: 0.1 });

    assert.deepEqual(footers.map(footer => footer.value), [300, 330]);
  });

  it('resolves formula columns that reference later columns', () => {
    const columns = [
      { id: 'a', label: 'A', key: 'a', width: 1, valueType: 'text' as const, align: 'left' as const },
      {
        id: 'b',
        label: 'B',
        key: 'b',
        width: 1,
        valueType: 'formula' as const,
        align: 'right' as const,
        formula: { kind: 'expression' as const, expression: 'row.c + 1' },
      },
      {
        id: 'c',
        label: 'C',
        key: 'c',
        width: 1,
        valueType: 'formula' as const,
        align: 'right' as const,
        formula: { kind: 'expression' as const, expression: 'row.a * 2' },
      },
    ];
    const rows = computeTableRows(columns, [{ id: 'r1', a: 5 }]);

    assert.equal(rows[0].b, 11);
    assert.equal(rows[0].c, 10);
  });

  it('returns FORMULA_ERROR for circular column references', () => {
    const columns = [
      {
        id: 'x',
        label: 'X',
        key: 'x',
        width: 1,
        valueType: 'formula' as const,
        align: 'right' as const,
        formula: { kind: 'expression' as const, expression: 'row.y + 1' },
      },
      {
        id: 'y',
        label: 'Y',
        key: 'y',
        width: 1,
        valueType: 'formula' as const,
        align: 'right' as const,
        formula: { kind: 'expression' as const, expression: 'row.x + 1' },
      },
    ];
    const rows = computeTableRows(columns, [{ id: 'r1' }]);

    assert.equal(rows[0].x, FORMULA_ERROR);
    assert.equal(rows[0].y, FORMULA_ERROR);
  });

  it('marks a formula referencing an unknown column as FORMULA_ERROR', () => {
    const columns = [
      {
        id: 'a',
        label: 'A',
        key: 'a',
        width: 1,
        valueType: 'formula' as const,
        align: 'right' as const,
        formula: { kind: 'expression' as const, expression: 'row.ghost + 1' },
      },
      { id: 'b', label: 'B', key: 'b', width: 1, valueType: 'number' as const, align: 'right' as const },
    ];
    const rows = computeTableRows(columns, [{ id: 'r1', b: 5 }]);

    assert.equal(rows[0].a, FORMULA_ERROR);
    assert.equal(rows[0].b, 5);
  });

  it('cascades a runtime error without affecting independent columns', () => {
    const columns = [
      { id: 'input', label: 'Input', key: 'input', width: 1, valueType: 'number' as const, align: 'right' as const },
      {
        id: 'x',
        label: 'X',
        key: 'x',
        width: 1,
        valueType: 'formula' as const,
        align: 'right' as const,
        formula: { kind: 'expression' as const, expression: 'row.input / 0' },
      },
      {
        id: 'y',
        label: 'Y',
        key: 'y',
        width: 1,
        valueType: 'formula' as const,
        align: 'right' as const,
        formula: { kind: 'expression' as const, expression: 'row.x + 1' },
      },
      { id: 'z', label: 'Z', key: 'z', width: 1, valueType: 'number' as const, align: 'right' as const },
    ];
    const result = computeTableRowsResult(columns, [{ id: 'r1', input: 2, z: 7 }]);

    assert.equal(result.rows[0].x, FORMULA_ERROR);
    assert.equal(result.rows[0].y, FORMULA_ERROR);
    assert.equal(result.rows[0].z, 7);
    assert.deepEqual(
      result.errors.filter(error => error.kind === 'row').map(error => error.columnKey),
      ['x', 'y'],
    );
  });

  it('marks a formula as errored for non-numeric input instead of coercing to zero', () => {
    const columns = [
      { id: 'amount', label: 'Amount', key: 'amount', width: 1, valueType: 'number' as const, align: 'right' as const },
      {
        id: 'total',
        label: 'Total',
        key: 'total',
        width: 1,
        valueType: 'formula' as const,
        align: 'right' as const,
        formula: { kind: 'expression' as const, expression: 'row.amount * 2' },
      },
    ];
    const result = computeTableRowsResult(columns, [{ id: 'r1', amount: 'abc' }]);

    assert.equal(result.rows[0].total, FORMULA_ERROR);
    assert.equal(result.errors.some(error =>
      error.kind === 'row' && error.columnKey === 'total'
    ), true);
  });

  it('marks a numeric input cell as errored without touching sibling cells', () => {
    const columns = [
      { id: 'item', label: 'Item', key: 'item', width: 1, valueType: 'text' as const, align: 'left' as const },
      { id: 'amount', label: 'Amount', key: 'amount', width: 1, valueType: 'number' as const, align: 'right' as const },
      { id: 'z', label: 'Z', key: 'z', width: 1, valueType: 'number' as const, align: 'right' as const },
    ];
    const result = computeTableRowsResult(columns, [{ id: 'r1', item: 'A', amount: 'abc', z: 7 }]);

    assert.equal(result.rows[0].amount, FORMULA_ERROR);
    assert.equal(result.rows[0].item, 'A');
    assert.equal(result.rows[0].z, 7);
    assert.deepEqual(
      result.errors.filter(error => error.kind === 'row').map(error => error.columnKey),
      ['amount'],
    );
  });

  it('keeps RUNNING_SUM row-aware with lazy formula dependencies', () => {
    const columns = [
      {
        id: 'running',
        label: '累计',
        key: 'running',
        width: 1,
        valueType: 'formula' as const,
        align: 'right' as const,
        formula: { kind: 'expression' as const, expression: 'RUNNING_SUM(row.amount)' },
      },
      { id: 'amount', label: '金额', key: 'amount', width: 1, valueType: 'number' as const, align: 'right' as const },
    ];
    const rows = computeTableRows(columns, [
      { id: 'row_1', amount: 2 },
      { id: 'row_2', amount: 3 },
    ]);

    assert.deepEqual(rows.map(row => row.running), [2, 5]);
  });

  it('does not publish a footer that depends on errored cells but keeps independent footers', () => {
    const columns = [
      { id: 'input', label: 'Input', key: 'input', width: 1, valueType: 'number' as const, align: 'right' as const },
      {
        id: 'x',
        label: 'X',
        key: 'x',
        width: 1,
        valueType: 'formula' as const,
        align: 'right' as const,
        formula: { kind: 'expression' as const, expression: 'row.input / 0' },
      },
      { id: 'z', label: 'Z', key: 'z', width: 1, valueType: 'number' as const, align: 'right' as const },
    ];
    const rowResult = computeTableRowsResult(columns, [{ id: 'r1', input: 2, z: 7 }]);
    const footerResult = computeTableFootersResult([
      {
        id: 'errored_total',
        label: '错误合计',
        formula: { kind: 'expression', expression: 'SUM(column.x)' },
      },
      {
        id: 'independent_total',
        label: '独立合计',
        formula: { kind: 'expression', expression: 'SUM(column.z)' },
      },
    ], rowResult.rows);

    assert.deepEqual(footerResult.footers.map(footer => footer.id), ['errored_total', 'independent_total']);
    assert.equal(footerResult.footers[0].value, FORMULA_ERROR);
    assert.equal(footerResult.footers[1].value, 7);
    assert.deepEqual(footerResult.errors.filter(error => error.kind === 'footer').map(error => error.footerId), [
      'errored_total',
    ]);
  });

  it('keeps an errored footer visible but out of published outputs', () => {
    const node = tableNode();
    node.columns = [
      { id: 'input', label: 'Input', key: 'input', width: 1, valueType: 'number', align: 'right' },
      {
        id: 'x',
        label: 'X',
        key: 'x',
        width: 1,
        valueType: 'formula',
        align: 'right',
        formula: { kind: 'expression', expression: 'row.input / 0' },
      },
      { id: 'z', label: 'Z', key: 'z', width: 1, valueType: 'number', align: 'right' },
    ];
    node.rows = [{ id: 'r1', input: 2, z: 7 }];
    node.footers = [
      {
        id: 'errored_total',
        label: 'Errored',
        formula: { kind: 'expression', expression: 'SUM(column.x)' },
      },
      {
        id: 'independent_total',
        label: 'Independent',
        formula: { kind: 'expression', expression: 'SUM(column.z)' },
      },
    ];

    const computed = computeTableNode(node);

    assert.deepEqual(computed.computedFooters.map(footer => footer.id), [
      'errored_total',
      'independent_total',
    ]);
    assert.equal(computed.computedFooters[0].value, FORMULA_ERROR);
    assert.deepEqual(computed.outputs.map(output => output.id), ['independent_total']);
  });
});
