import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gridPlugin } from '@/plugins/grid/grid.js';
import {
  evaluateGridFormula,
  evaluateGridFormulaCells,
  getFormulaReferences,
  gridColumnIndexToLabel,
  rebaseFormulaAfterColumnDeletion,
  rebaseFormulaAfterRowDeletion,
} from '@/plugins/grid/formula.js';
import { pluginRegistry } from '@/plugins/index.js';
import { layoutGridPresentation } from '@/engine/renderTree/gridPresentation.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import type { GridNode } from '@/engine/renderTree/model.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: () => 0,
  ensureBrowserFont: async () => 'default',
};

describe('grid plugin', () => {
  it('creates default element with 4 columns and 5 rows', () => {
    const element = gridPlugin.createDefaultElement({ id: 'grid_1', position: { x: 10, y: 10 } });
    assert.equal(element.id, 'grid_1');
    assert.equal(element.type, 'grid');
    assert.equal(element.props.columns.length, 4);
    assert.equal(element.props.rows.length, 5);
    assert.equal(element.box.width, 180);
    assert.equal(element.box.height, 60);
  });

  it('validates grid props successfully', () => {
    const element = gridPlugin.createDefaultElement({ id: 'grid_1', position: { x: 0, y: 0 } });
    const issues = pluginRegistry.validateElement(element);
    assert.equal(issues.length, 0);
  });

  it('rejects props with invalid cell keys', () => {
    const element = gridPlugin.createDefaultElement({ id: 'grid_1', position: { x: 0, y: 0 } });
    element.props.cells['badkey'] = { content: 'test', role: 'body' };
    const issues = pluginRegistry.validateElement(element);
    assert.equal(issues.length, 1);
    assert.ok(issues[0].message.includes('Invalid cell key'));
  });

  it('rejects props with out-of-bounds cell row', () => {
    const element = gridPlugin.createDefaultElement({ id: 'grid_1', position: { x: 0, y: 0 } });
    element.props.cells['99:a'] = { content: 'test', role: 'body' };
    const issues = pluginRegistry.validateElement(element);
    assert.equal(issues.length, 1);
    assert.ok(issues[0].message.includes('out of bounds'));
  });

  it('rejects non-canonical row keys and bounds pathological merged coverage', () => {
    const nonCanonical = gridPlugin.createDefaultElement({ id: 'grid_1', position: { x: 0, y: 0 } });
    nonCanonical.props.cells['01:a'] = { content: 'test', role: 'body' };
    assert.ok(pluginRegistry.validateElement(nonCanonical)
      .some(issue => issue.message.includes('row index')));

    const oversized = gridPlugin.createDefaultElement({ id: 'grid_2', position: { x: 0, y: 0 } });
    oversized.props.cells['0:a'].rowSpan = 1_000_000_000;
    assert.ok(pluginRegistry.validateElement(oversized)
      .some(issue => issue.message.includes('exceeds the available rows')));
  });

  it('rejects props with unknown column key', () => {
    const element = gridPlugin.createDefaultElement({ id: 'grid_1', position: { x: 0, y: 0 } });
    element.props.cells['0:zzz'] = { content: 'test', role: 'body' };
    const issues = pluginRegistry.validateElement(element);
    assert.equal(issues.length, 1);
    assert.ok(issues[0].message.includes('unknown column key'));
  });

  it('rejects overlapping merged cells', () => {
    const element = gridPlugin.createDefaultElement({ id: 'grid_1', position: { x: 0, y: 0 } });
    element.props.cells['0:a'].columnSpan = 2;
    const issues = pluginRegistry.validateElement(element);
    assert.ok(issues.some(issue => issue.message.includes('overlaps merged cell')));
  });

  it('builds render nodes with computed cells', () => {
    const element = gridPlugin.createDefaultElement({ id: 'grid_1', position: { x: 0, y: 0 } });
    const nodes = gridPlugin.buildRenderNodes({
      element,
      value: '',
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager,
        format: defaultFormatSettingsForLocale('ja-JP'),
        createNodeId: localId => `el_1:node:${localId}`,
        report: () => {},
      },
    });
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].kind, 'grid');
  });

  it('resolves formula dependencies and reports cycles', () => {
    const element = gridPlugin.createDefaultElement({ id: 'grid_1', position: { x: 0, y: 0 } });
    element.props.cells['0:a'].content = '=B1+1';
    element.props.cells['0:b'].content = '=2+3';
    element.props.cells['0:c'].content = '=D1';
    element.props.cells['0:d'].content = '=C1';
    const codes: string[] = [];
    const nodes = gridPlugin.buildRenderNodes({
      element,
      value: '',
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager,
        format: defaultFormatSettingsForLocale('ja-JP'),
        createNodeId: localId => `el_1:node:${localId}`,
        report: issue => codes.push(issue.code),
      },
    });
    assert.equal(nodes[0].kind === 'grid' && nodes[0].computedCells['0:a'].content, '6');
    assert.deepEqual(codes, ['GRID_FORMULA_CYCLE', 'GRID_FORMULA_CYCLE']);
  });

});

describe('grid formula evaluator', () => {
  it('returns undefined for non-formula strings', () => {
    assert.equal(evaluateGridFormula('hello', {}), undefined);
    assert.equal(evaluateGridFormula('123', {}), undefined);
  });

  it('evaluates simple arithmetic', () => {
    assert.equal(evaluateGridFormula('=1+2', {}), 3);
    assert.equal(evaluateGridFormula('=10-3', {}), 7);
    assert.equal(evaluateGridFormula('=4*5', {}), 20);
    assert.equal(evaluateGridFormula('=20/4', {}), 5);
  });

  it('evaluates expressions with operator precedence', () => {
    assert.equal(evaluateGridFormula('=2+3*4', {}), 14);
    assert.equal(evaluateGridFormula('=(2+3)*4', {}), 20);
  });

  it('evaluates cell references', () => {
    const values = { '0:a': 10, '1:b': 20 };
    assert.equal(evaluateGridFormula('=A1+B2', values), 30);
  });

  it('maps visual A1 coordinates to stable persisted column keys beyond Z', () => {
    const columnKeys = Array.from({ length: 27 }, (_, index) => `stable_${index}`);
    assert.equal(gridColumnIndexToLabel(0), 'a');
    assert.equal(gridColumnIndexToLabel(25), 'z');
    assert.equal(gridColumnIndexToLabel(26), 'aa');
    const formulaContext = { columnKeys, rowCount: 1 };
    assert.equal(evaluateGridFormula('=A1+AA1', {
      '0:stable_0': 2,
      '0:stable_26': 5,
    }, formulaContext), 7);
    assert.deepEqual(getFormulaReferences('=SUM(Z1:AA1)', formulaContext), [
      '0:stable_25',
      '0:stable_26',
    ]);
  });

  it('rejects references outside the current grid and oversized ranges', () => {
    const context = { columnKeys: ['a', 'b'], rowCount: 2 };
    assert.equal(evaluateGridFormula('=Z1+1', {}, context), undefined);
    assert.equal(evaluateGridFormula('=A99+1', {}, context), undefined);
    assert.equal(evaluateGridFormula('=SUM(A1:A999999999)', {}), undefined);
  });

  it('propagates invalid formula dependencies instead of treating them as zero', () => {
    const validCellKeys = new Set(['0:a', '0:b']);
    const result = evaluateGridFormulaCells({
      '0:a': '=B1+1',
      '0:b': '=1/0',
    }, { columnKeys: ['a', 'b'], rowCount: 1, validCellKeys });
    assert.deepEqual([...result.invalidKeys].sort(), ['0:a', '0:b']);
    assert.equal(result.values['0:a'], undefined);
  });

  it('caps aggregate formula reference expansion for a valid-size grid', () => {
    const columnKeys = Array.from({ length: 200 }, (_, index) => `key_${index}`);
    const validCellKeys = new Set(Array.from({ length: 100 }, (_, row) =>
      columnKeys.map(column => `${row}:${column}`)
    ).flat());
    const result = evaluateGridFormulaCells(Object.fromEntries(
      columnKeys.slice(0, 5).map(column => [`0:${column}`, '=SUM(A2:GR100)'])
    ), { columnKeys, rowCount: 100, validCellKeys });
    assert.equal(result.invalidKeys.size, 1);
    assert.equal(result.cycleKeys.size, 0);
  });

  it('charges repeated ranges against the expansion budget before materializing them', () => {
    const columnKeys = Array.from({ length: 200 }, (_, index) => `key_${index}`);
    const validCellKeys = new Set(Array.from({ length: 100 }, (_, row) =>
      columnKeys.map(column => `${row}:${column}`)
    ).flat());
    const repeated = Array.from({ length: 5 }, () => 'SUM(A1:GR100)').join('+');
    const result = evaluateGridFormulaCells({ '0:key_0': `=${repeated}` }, {
      columnKeys,
      rowCount: 100,
      validCellKeys,
    });
    assert.deepEqual([...result.invalidKeys], ['0:key_0']);
  });

  it('keeps cycle dependents as dependency errors instead of cycle members', () => {
    const validCellKeys = new Set(['0:a', '0:b', '0:c']);
    const result = evaluateGridFormulaCells({
      '0:a': '=B1',
      '0:b': '=A1',
      '0:c': '=A1+1',
    }, { columnKeys: ['a', 'b', 'c'], rowCount: 1, validCellKeys });
    assert.deepEqual([...result.cycleKeys].sort(), ['0:a', '0:b']);
    assert.deepEqual([...result.invalidKeys], ['0:c']);
  });

  it('evaluates wide formula fan-out without rebuilding adjacency arrays', () => {
    const rowCount = 5_000;
    const validCellKeys = new Set(Array.from({ length: rowCount }, (_, row) => `${row}:a`));
    const contents = Object.fromEntries(Array.from({ length: rowCount }, (_, row) => [
      `${row}:a`,
      row === 0 ? '=1' : '=A1',
    ]));
    const result = evaluateGridFormulaCells(contents, { columnKeys: ['a'], rowCount, validCellKeys });
    assert.equal(result.invalidKeys.size, 0);
    assert.equal(result.values[`${rowCount - 1}:a`], 1);
  });

  it('evaluates SUM function', () => {
    const values = { '0:a': 10, '1:a': 20, '2:a': 30 };
    assert.equal(evaluateGridFormula('=SUM(A1:A3)', values), 60);
  });

  it('evaluates AVERAGE function', () => {
    const values = { '0:a': 10, '1:a': 20, '2:a': 30 };
    assert.equal(evaluateGridFormula('=AVERAGE(A1:A3)', values), 20);
  });

  it('evaluates MAX and MIN functions', () => {
    const values = { '0:a': 5, '1:a': 10, '2:a': 3 };
    assert.equal(evaluateGridFormula('=MAX(A1:A3)', values), 10);
    assert.equal(evaluateGridFormula('=MIN(A1:A3)', values), 3);
  });

  it('uses the shared directional rounding functions', () => {
    assert.equal(evaluateGridFormula('=ROUNDUP(A1 * PERCENT(10), 0)', {
      '0:a': 101,
    }), 11);
    assert.equal(evaluateGridFormula('=ROUNDDOWN(A1 * PERCENT(10), 0)', {
      '0:a': 109,
    }), 10);
    assert.equal(evaluateGridFormula('=FLOOR(-10.1)', {}), -11);
    assert.equal(evaluateGridFormula('=CEIL(-10.9)', {}), -10);
  });

  it('handles empty formulas', () => {
    assert.equal(evaluateGridFormula('=', {}), undefined);
  });

  it('rejects malformed expressions and division by zero', () => {
    assert.equal(evaluateGridFormula('=1oops', {}), undefined);
    assert.equal(evaluateGridFormula('=1/0', {}), undefined);
    assert.equal(evaluateGridFormula('=SUM(A3:A1)', {}), undefined);
  });

  it('rebases references safely when rows or columns are deleted', () => {
    assert.equal(rebaseFormulaAfterRowDeletion('=A1+B3', 1), '=A1+B2');
    assert.equal(rebaseFormulaAfterRowDeletion('=SUM(A1:A3)', 0), '=SUM(#REF!:A2)');
    assert.equal(rebaseFormulaAfterColumnDeletion('=A1+B2', 'a'), '=#REF!+A2');
  });
});

describe('grid presentation layout', () => {
  const baseNode: GridNode = {
    kind: 'grid',
    id: 'grid_1',
    sourceElementId: 'el_1',
    box: { x: 0, y: 0, width: 180, height: 60 },
    rotate: 0,
    opacity: 1,
    clip: false,
    zIndex: 0,
    columns: [
      { id: 'col_a', key: 'a', width: 1 },
      { id: 'col_b', key: 'b', width: 2 },
    ],
    rows: [
      { id: 'row_0' },
      { id: 'row_1' },
    ],
    cells: {
      '0:a': { content: 'Header', role: 'header' },
      '0:b': { content: 'Header B', role: 'header' },
      '1:a': { content: '=1+2', role: 'body' },
      '1:b': { content: 'Value', role: 'body' },
    },
    computedCells: {
      '0:a': { content: 'Header', role: 'header' },
      '0:b': { content: 'Header B', role: 'header' },
      '1:a': { content: '3', role: 'body' },
      '1:b': { content: 'Value', role: 'body' },
    },
    layout: { cells: [], lines: [], height: 0 },
    style: {
      border: { width: 0.5, color: '#d9d9d9', style: 'solid' },
      headerHeight: 8,
      rowHeight: 10,
      fontSize: 10,
    },
  };

  it('produces layout cells for all populated cells', () => {
    const result = layoutGridPresentation(baseNode, fontManager);
    assert.equal(result.layout.cells.length, 4);
    assert.equal(result.layout.height, 18);
  });

  it('publishes the resolved real Bold face for bold grid cells', () => {
    const manager: FontManager = {
      ...fontManager,
      resolveFontFace: (_name, weight) => ({
        name: weight === 'bold' ? 'default-bold' : 'default',
        syntheticBold: false,
      }),
    };
    const result = layoutGridPresentation({
      ...baseNode,
      computedCells: {
        ...baseNode.computedCells,
        '0:a': { ...baseNode.computedCells['0:a'], bold: true },
      },
    }, manager);
    const boldCell = result.layout.cells.find(cell => cell.id.includes(':0:a'))!;

    assert.equal(boldCell.fontName, 'default-bold');
    assert.equal(boldCell.syntheticBold, false);
  });

  it('positions cells with correct dimensions', () => {
    const result = layoutGridPresentation(baseNode, fontManager);
    const colAWidth = 180 / 3;
    const colBWidth = 360 / 3;

    const cellA0 = result.layout.cells.find(c => c.id.includes(':0:a'));
    assert.ok(cellA0);
    assert.equal(cellA0.box.x, 0);
    assert.equal(cellA0.box.width, colAWidth);
    assert.equal(cellA0.box.height, 8);

    const cellB1 = result.layout.cells.find(c => c.id.includes(':1:b'));
    assert.ok(cellB1);
    assert.equal(cellB1.box.x, colAWidth);
    assert.equal(cellB1.box.width, colBWidth);
    assert.equal(cellB1.box.y, 8);
    assert.equal(cellB1.box.height, 10);
  });

  it('generates border lines for cells', () => {
    const result = layoutGridPresentation(baseNode, fontManager);
    assert.ok(result.layout.lines.length > 0);
  });

  it('includes computed formula values in layout text', () => {
    const result = layoutGridPresentation(baseNode, fontManager);
    const cellA1 = result.layout.cells.find(c => c.id.includes(':1:a'));
    assert.ok(cellA1);
    assert.equal(cellA1.lines[0]?.text, '3');
  });

  it('lays out merged cells across column and row tracks', () => {
    const merged: GridNode = {
      ...baseNode,
      computedCells: {
        '0:a': { content: 'Merged', role: 'header', columnSpan: 2, rowSpan: 2 },
      },
    };
    const result = layoutGridPresentation(merged, fontManager);
    assert.equal(result.layout.cells.length, 1);
    assert.deepEqual(result.layout.cells[0].box, { x: 0, y: 0, width: 180, height: 18 });
  });

  it('lays out runtime edge prefixes separately and reports collisions', () => {
    const measuringFontManager: FontManager = {
      ...fontManager,
      measureText: (_name, text, size) => text.length * size * 0.5,
    };
    const edgePrefixNode: GridNode = {
      ...baseNode,
      box: { ...baseNode.box, width: 8 },
      columns: [{ id: 'col_a', key: 'a', width: 1 }],
      rows: [{ id: 'row_0' }],
      cells: {
        '0:a': { content: '123456', role: 'body', align: 'right' },
      },
      computedCells: {
        '0:a': {
          content: '123456',
          prefixText: '$',
          role: 'body',
          align: 'right',
        },
      },
    };

    const result = layoutGridPresentation(edgePrefixNode, measuringFontManager);
    assert.equal(result.layout.cells[0].prefixLines?.[0]?.text, '$');
    assert.match(result.layout.cells[0].lines.map(line => line.text).join(''), /^123/);
    assert.equal(result.layout.cells[0].overflow, true);
  });
});
