import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gridPlugin } from '@/plugins/grid/grid.js';
import { evaluateGridFormulaCells } from '@/plugins/grid/formula.js';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import type { GridNode } from '@/engine/renderTree/model.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: () => 0,
  ensureBrowserFont: async () => 'default',
};

const context = {
  columnKeys: ['a', 'b', 'c'],
  rowCount: 3,
  validCellKeys: new Set([
    '0:a', '0:b', '0:c',
    '1:a', '1:b', '1:c',
    '2:a', '2:b', '2:c',
  ]),
};

describe('grid aggregate blank handling', () => {
  it('skips blank cells in AVERAGE, COUNT, MIN, and MAX', () => {
    const result = evaluateGridFormulaCells({
      '0:a': '10',
      '2:a': '20',
      '0:b': '=AVERAGE(A1:A3)',
      '1:b': '=COUNT(A1:A3)',
      '2:b': '=MIN(A1:A3)',
      '0:c': '=MAX(A1:A3)',
    }, context);

    assert.equal(result.values['0:b'], 15);
    assert.equal(result.values['1:b'], 2);
    assert.equal(result.values['2:b'], 10);
    assert.equal(result.values['0:c'], 20);
    assert.equal(result.invalidKeys.size, 0);
  });

  it('treats a blank cell as zero in arithmetic but still sums it as zero', () => {
    const result = evaluateGridFormulaCells({
      '2:a': '20',
      '0:b': '=A1+1',
      '1:b': '=SUM(A1:A3)',
    }, context);

    assert.equal(result.values['0:b'], 1);
    assert.equal(result.values['1:b'], 20);
  });

  it('reports a non-numeric reference instead of treating it as zero', () => {
    const result = evaluateGridFormulaCells({
      '0:a': '8%',
      '0:b': '=A1+1',
    }, context);

    assert.ok(result.invalidKeys.has('0:b'));
    assert.equal(result.values['0:b'], undefined);
  });
});

describe('grid numeric result formatting', () => {
  it('keeps unformatted formula results at their computed precision', () => {
    const element = gridPlugin.createDefaultElement({ id: 'grid_1', position: { x: 10, y: 10 } });
    element.props.cells['0:a'] = {
      ...element.props.cells['0:a'],
      content: '=1/3',
    };

    const nodes = gridPlugin.buildRenderNodes({
      element,
      value: '',
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager,
        format: defaultFormatSettingsForLocale('en-US'),
        createNodeId: localId => `grid_1:node:${localId}`,
        report: () => {},
      },
    });

    const node = nodes[0] as GridNode;
    assert.equal(node.computedCells['0:a'].content, '0.333333333333333');
  });

  it('routes formula results through the numeric formatter per column', () => {
    const element = gridPlugin.createDefaultElement({ id: 'grid_1', position: { x: 10, y: 10 } });
    element.props.columns[0] = {
      ...element.props.columns[0],
      numericFormat: {
        prefix: '',
        symbolLayout: 'attached',
        zeroDisplay: 'zero',
        emptyDisplay: 'blank',
        decimalPlaces: 2,
      },
    };
    element.props.cells['0:a'] = {
      ...element.props.cells['0:a'],
      content: '=1234.5',
    };

    const nodes = gridPlugin.buildRenderNodes({
      element,
      value: '',
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager,
        format: defaultFormatSettingsForLocale('en-US'),
        createNodeId: localId => `grid_1:node:${localId}`,
        report: () => {},
      },
    });

    const node = nodes[0] as GridNode;
    assert.equal(node.computedCells['0:a'].content, '1,234.50');
  });

  it('lets a cell override the column format', () => {
    const element = gridPlugin.createDefaultElement({ id: 'grid_1', position: { x: 10, y: 10 } });
    element.props.columns[0] = {
      ...element.props.columns[0],
      numericFormat: {
        prefix: '',
        symbolLayout: 'attached',
        zeroDisplay: 'zero',
        emptyDisplay: 'blank',
        decimalPlaces: 0,
      },
    };
    element.props.cells['0:a'] = {
      ...element.props.cells['0:a'],
      content: '=1234.5',
      numericFormat: {
        prefix: '$',
        symbolLayout: 'edge',
        zeroDisplay: 'zero',
        emptyDisplay: 'blank',
        decimalPlaces: 2,
      },
    };

    const nodes = gridPlugin.buildRenderNodes({
      element,
      value: '',
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager,
        format: defaultFormatSettingsForLocale('en-US'),
        createNodeId: localId => `grid_1:node:${localId}`,
        report: () => {},
      },
    });

    const node = nodes[0] as GridNode;
    assert.equal(node.computedCells['0:a'].content, '1,234.50');
    assert.equal(node.computedCells['0:a'].prefixText, '$');
  });
});
