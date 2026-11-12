import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FontManager } from '../../engine/pdf/font/fontManager.js';
import { createPluginRegistry } from '../../engine/core/pluginRegistry.js';
import { TableColumnSchema, TablePaginationSchema, tablePlugin } from './table.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: () => 0,
  ensureBrowserFont: async () => 'default',
};

const format = defaultFormatSettingsForLocale('ja-JP');

describe('tablePlugin', () => {
  it('uses structured props and values without JSON serialization', () => {
    const registry = createPluginRegistry([tablePlugin]);
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
    assert.equal(registry.validateElement(element).length, 0);
    assert.ok(Array.isArray(element.props.columns));
    assert.ok(Array.isArray(element.props.footers));
    assert.ok(Array.isArray(element.value));
    assert.deepEqual(element.props.pagination, {
      finalElementIds: [],
      repeatElementIds: [],
      rowMode: 'compact',
      minRowsOnLastPage: 1,
      gapAfterTable: 3,
    });
  });

  it('normalizes partial legacy pagination and rejects ambiguous element ownership', () => {
    const defaults = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } })
      .props.pagination!;
    assert.equal(TablePaginationSchema.safeParse(defaults).success, true);
    assert.deepEqual(TablePaginationSchema.parse({ rowMode: 'preserve', followGroupId: 'legacy_group' }), {
      finalElementIds: [],
      repeatElementIds: [],
      rowMode: 'preserve',
      minRowsOnLastPage: 1,
      gapAfterTable: 3,
    });

    const duplicate = structuredClone(defaults);
    duplicate.finalElementIds = ['el_footer', 'el_footer'];
    assert.equal(tablePlugin.propsSchema.safeParse({
      ...tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } }).props,
      pagination: duplicate,
    }).success, false);

    const overlap = structuredClone(defaults);
    overlap.finalElementIds = ['el_footer'];
    overlap.repeatElementIds = ['el_footer'];
    assert.equal(tablePlugin.propsSchema.safeParse({
      ...tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } }).props,
      pagination: overlap,
    }).success, false);
  });

  it('accepts an optional continuation title while preserving legacy defaults', () => {
    const parsed = TablePaginationSchema.parse({
      continuation: { title: '  Details continued  ', showFragmentIndex: true },
    });

    assert.deepEqual(parsed.continuation, {
      title: 'Details continued',
      showFragmentIndex: true,
    });
    assert.equal(TablePaginationSchema.safeParse({
      continuation: { title: 'x'.repeat(201) },
    }).success, false);
  });

  it('accepts legacy columns without header alignment and rejects invalid alignment', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
    const column = structuredClone(element.props.columns[0]);
    delete column.headerAlign;

    assert.equal(TableColumnSchema.safeParse(column).success, true);
    assert.equal(TableColumnSchema.safeParse({ ...column, headerAlign: 'justify' }).success, false);
    assert.ok(element.props.columns.every(item => item.headerAlign === 'center'));
  });

  it('provides configurable cell padding and header weight with legacy fallbacks', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
    assert.equal(element.props.style.cellPadding, 1.5);
    assert.equal(element.props.style.headerBold, true);

    const legacyProps = structuredClone(element.props);
    delete legacyProps.style.cellPadding;
    delete legacyProps.style.headerBold;
    assert.equal(tablePlugin.propsSchema.safeParse(legacyProps).success, true);

    element.props.style.cellPadding = 11;
    assert.equal(tablePlugin.propsSchema.safeParse(element.props).success, false);
  });

  it('builds an uncomputed table node with raw structured input', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
    const value = [{ id: 'row_1', item: '作業', quantity: 2, unitPrice: 500 }];
    const node = tablePlugin.buildRenderNodes({
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

    assert.equal(node.kind, 'table');
    assert.deepEqual(node.kind === 'table' && node.rows, value);
    assert.deepEqual(node.kind === 'table' && node.computedRows, []);
    assert.deepEqual(node.kind === 'table' && node.computedFooters, []);
    assert.deepEqual(node.input?.value, value);
    assert.notEqual(node.kind === 'table' && node.rows, value);
  });

  it('builds a visible table node from an existing partial pagination object', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
    element.props.pagination = { rowMode: 'preserve' } as typeof element.props.pagination;
    const node = tablePlugin.buildRenderNodes({
      element,
      value: [],
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

    assert.equal(node.kind, 'table');
    assert.deepEqual(node.kind === 'table' && node.pagination, {
      finalElementIds: [],
      repeatElementIds: [],
      rowMode: 'preserve',
      minRowsOnLastPage: 1,
      gapAfterTable: 3,
    });
  });

  it('accepts expression totals and validates footer placement columns', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
    element.props.footers = [{
      id: 'tax_inclusive',
      label: '税込合计',
      formula: { kind: 'expression', expression: 'SUM(column.amount) * 1.1' },
      startColumnKey: 'unitPrice',
      valueColumnKey: 'amount',
      fontSize: 14,
    }];
    const registry = createPluginRegistry([tablePlugin]);
    assert.equal(registry.validateElement(element).length, 0);

    element.props.footers[0].startColumnKey = 'amount';
    element.props.footers[0].valueColumnKey = 'quantity';
    const issues = registry.validateElement(element);
    assert.ok(issues.some(issue => issue.message.includes('must be before')));

    const invalidSource = structuredClone(element.props.footers[0]);
    invalidSource.formula.expression = 'SUM(column.missing)';
    assert.equal(tablePlugin.propsSchema.safeParse({
      ...element.props,
      footers: [invalidSource],
    }).success, false);
  });

  it('accepts optional footer border presets and clones their nested style', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
    element.props.footerStyle = {
      borderPreset: 'custom',
      borderEdges: ['top', 'bottom', 'vertical'],
      border: { width: 1.5, color: '#333333', style: 'dashed' },
    };
    assert.equal(tablePlugin.propsSchema.safeParse(element.props).success, true);

    const node = tablePlugin.buildRenderNodes({
      element,
      value: [],
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
    assert.equal(node.kind, 'table');
    if (node.kind !== 'table') return;
    assert.deepEqual(node.footerStyle, element.props.footerStyle);
    assert.notEqual(node.footerStyle, element.props.footerStyle);
    assert.notEqual(node.footerStyle?.border, element.props.footerStyle.border);
    assert.notEqual(node.footerStyle?.borderEdges, element.props.footerStyle.borderEdges);
  });

  it('rejects duplicate ids and invalid formula references', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 0, y: 0 } });
    element.props.columns[1].id = element.props.columns[0].id;
    element.props.columns[3].formula = { kind: 'expression', expression: 'row.missing' };
    const issues = createPluginRegistry([tablePlugin]).validateElement(element);
    assert.ok(issues.some(issue => issue.path?.includes('columns.1.id')));
    assert.ok(issues.some(issue => issue.message.includes('Unknown formula source key')));

    element.props = tablePlugin.createDefaultElement({ id: 'other', position: { x: 0, y: 0 } }).props;
    element.value = [{ id: 'row_1' }, { id: 'row_1' }];
    const rowIssues = createPluginRegistry([tablePlugin]).validateElement(element);
    assert.ok(rowIssues.some(issue => issue.message.includes('Duplicate row id')));
  });

  it('allows formula columns to reference later formula columns', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 0, y: 0 } });
    element.props.footers = [];
    element.props.columns = [
      { id: 'col_a', label: 'A', key: 'a', width: 1, valueType: 'number', align: 'right' },
      {
        id: 'col_b',
        label: 'B',
        key: 'b',
        width: 1,
        valueType: 'formula',
        align: 'right',
        formula: { kind: 'expression', expression: 'row.c + 1' },
      },
      {
        id: 'col_c',
        label: 'C',
        key: 'c',
        width: 1,
        valueType: 'formula',
        align: 'right',
        formula: { kind: 'expression', expression: 'row.a * 2' },
      },
    ];

    assert.equal(tablePlugin.propsSchema.safeParse(element.props).success, true);
  });

  it('rejects circular column formula references', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 0, y: 0 } });
    element.props.footers = [];
    element.props.columns = [
      {
        id: 'col_x',
        label: 'X',
        key: 'x',
        width: 1,
        valueType: 'formula',
        align: 'right',
        formula: { kind: 'expression', expression: 'row.y + 1' },
      },
      {
        id: 'col_y',
        label: 'Y',
        key: 'y',
        width: 1,
        valueType: 'formula',
        align: 'right',
        formula: { kind: 'expression', expression: 'row.x + 1' },
      },
    ];

    const result = tablePlugin.propsSchema.safeParse(element.props);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.issues.some(issue => issue.message.includes('circular references')));
    }
  });

  it('accepts forward footer references and rejects circular references', () => {
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 0, y: 0 } });
    element.props.footers = [
      {
        id: 'total',
        label: '合计',
        formula: { kind: 'expression', expression: 'footer.subtotal + footer.tax' },
      },
      {
        id: 'subtotal',
        label: '小计',
        formula: { kind: 'expression', expression: 'SUM(column.amount)' },
      },
      {
        id: 'tax',
        label: '税',
        formula: { kind: 'expression', expression: 'footer.subtotal * 0.1' },
      },
    ];
    const registry = createPluginRegistry([tablePlugin]);
    assert.equal(registry.validateElement(element).length, 0);

    element.props.footers[1].formula = { kind: 'expression', expression: 'footer.total' };
    const issues = registry.validateElement(element);
    assert.ok(issues.some(issue => issue.message.includes('circular references')));
  });
});
