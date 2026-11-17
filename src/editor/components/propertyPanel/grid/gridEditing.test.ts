import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IdGenerator, IdPrefix } from '@/engine/core/document.js';
import type { GridCell, GridColumn, GridRow } from '@/engine/renderTree/model.js';
import {
  addGridColumn,
  addGridRow,
  deleteGridColumn,
  deleteGridRow,
  expandGrid,
  getNextGridColumnKey,
  insertGridColumn,
  insertGridRow,
  moveGridColumn,
  moveGridRow,
  type GridData,
} from '@/editor/components/propertyPanel/grid/gridEditing.js';
import { TEMPLATE_COMPLEXITY_LIMITS } from '@/engine/utils/limits.js';

function sequentialIds(): IdGenerator {
  let counter = 0;
  return (prefix: IdPrefix) => `${prefix}_${++counter}`;
}

function cell(content: string, extra: Partial<GridCell> = {}): GridCell {
  return { content, role: 'body', align: 'left', ...extra };
}

function columns(...keys: string[]): GridColumn[] {
  return keys.map(key => ({ id: `col_${key}`, key, width: 1 }));
}

function rows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({ id: `row_${index}` }));
}

function gridOf(
  columnKeys: string[],
  rowCount: number,
  cells: Record<string, GridCell> = {},
): GridData {
  const gridColumns = columns(...columnKeys);
  const gridRows = rows(rowCount);
  const filled: Record<string, GridCell> = {};
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    for (const column of gridColumns) {
      const key = `${rowIndex}:${column.key}`;
      filled[key] = cells[key] ?? cell('');
    }
  }
  return { columns: gridColumns, rows: gridRows, cells: { ...filled, ...cells } };
}

describe('grid structural edits', () => {
  it('shifts cells and formulas when a row is inserted above them', () => {
    const data = gridOf(['a', 'b'], 2, { '1:b': cell('=A1') });

    const result = insertGridRow(data, 0, sequentialIds());

    assert.equal(result.rows.length, 3);
    assert.equal(result.cells['2:b'].content, '=A2');
    assert.equal(result.cells['0:a'].content, '');
  });

  it('grows a merged cell that spans the inserted row', () => {
    const data: GridData = {
      columns: columns('a', 'b'),
      rows: rows(3),
      cells: { '0:a': cell('Merged', { rowSpan: 2 }) },
    };

    const result = insertGridRow(data, 1, sequentialIds());

    assert.equal(result.cells['0:a'].rowSpan, 3);
    assert.equal(result.cells['0:a'].content, 'Merged');
    assert.equal(result.cells['1:a'], undefined);
  });

  it('shrinks a range and drops covered cells when a row is deleted', () => {
    const data = gridOf(['a', 'b'], 3, { '1:b': cell('=SUM(A1:A3)') });

    const result = deleteGridRow(data, 0);

    assert.equal(result.rows.length, 2);
    assert.equal(result.cells['0:b'].content, '=SUM(A1:A2)');
  });

  it('does not allow deleting the last grid row', () => {
    const data = gridOf(['a'], 1);

    assert.equal(deleteGridRow(data, 0), data);
  });

  it('shifts formulas when a column is inserted', () => {
    const data = gridOf(['a', 'b'], 2, { '1:a': cell('=B2') });

    const result = insertGridColumn(data, 1, sequentialIds());

    assert.equal(result.columns.length, 3);
    assert.equal(result.columns[1].key, 'c');
    assert.equal(result.cells['1:a'].content, '=C2');
  });

  it('repoints formulas when a column is deleted', () => {
    const data = gridOf(['a', 'b', 'c'], 2, { '1:a': cell('=C2') });

    const result = deleteGridColumn(data, 1);

    assert.deepEqual(result.columns.map(column => column.key), ['a', 'c']);
    assert.equal(result.cells['1:a'].content, '=B2');
  });

  it('keeps column keys that contain a colon usable in cell keys', () => {
    const data: GridData = {
      columns: [
        { id: 'col_item', key: 'item:a', width: 1 },
        { id: 'col_qty', key: 'qty', width: 1 },
        { id: 'col_price', key: 'price', width: 1 },
      ],
      rows: rows(2),
      cells: {
        '0:item:a': cell('Item'),
        '0:qty': cell('Qty'),
        '0:price': cell('Price'),
        '1:item:a': cell('Widget'),
        '1:qty': cell('=C2'),
        '1:price': cell('4'),
      },
    };

    const result = deleteGridColumn(data, 0);

    assert.deepEqual(result.columns.map(column => column.key), ['qty', 'price']);
    assert.equal(result.cells['1:qty'].content, '=B2');
    assert.equal(result.cells['1:item:a'], undefined);
  });

  it('keeps formulas pointing at their row when it is moved', () => {
    const data = gridOf(['a', 'b'], 3, {
      '1:b': cell('=A3'),
      '2:a': cell('Moved'),
    });

    const result = moveGridRow(data, 2, 0);

    assert.equal(result.rows[0].id, 'row_2');
    assert.equal(result.cells['0:a'].content, 'Moved');
    assert.equal(result.cells['2:b'].content, '=A1');
  });

  it('rejects moving a row that would split a merged cell', () => {
    const data = gridOf(['a', 'b'], 3, {
      '0:a': cell('Merged', { rowSpan: 2 }),
    });

    assert.throws(() => moveGridRow(data, 1, 2));
  });

  it('keeps formulas pointing at their column when it is moved', () => {
    const data = gridOf(['a', 'b', 'c'], 2, { '1:b': cell('=C1') });

    const result = moveGridColumn(data, 2, 0);

    assert.deepEqual(result.columns.map(column => column.key), ['c', 'a', 'b']);
    assert.equal(result.cells['1:b'].content, '=A1');
  });

  it('adds rows and columns at the end', () => {
    const data = gridOf(['a'], 1);
    const ids = sequentialIds();

    const withRow = addGridRow(data, ids);
    const withColumn = addGridColumn(withRow, ids);

    assert.equal(withRow.rows.length, 2);
    assert.equal(withColumn.columns.length, 2);
    assert.equal(withColumn.columns[1].key, 'b');
    assert.equal(withColumn.cells['1:b'].content, '');
  });

  it('expands without changing existing content', () => {
    const data = gridOf(['a'], 1, { '0:a': cell('Keep') });

    const result = expandGrid(data, 2, 2, sequentialIds());

    assert.equal(result.rows.length, 2);
    assert.equal(result.columns.length, 2);
    assert.equal(result.cells['0:a'].content, 'Keep');
    assert.equal(result.cells['1:b'].content, '');
  });

  it('allocates the next free column key past z', () => {
    const used = columns('a', 'b');
    assert.equal(getNextGridColumnKey(used), 'c');

    const alphabet = Array.from({ length: 26 }, (_, index) =>
      String.fromCharCode(97 + index));
    assert.equal(getNextGridColumnKey(columns(...alphabet)), 'aa');
  });

  it('rejects edits past the grid limits', () => {
    const tall: GridData = {
      columns: columns('a'),
      rows: Array.from(
        { length: TEMPLATE_COMPLEXITY_LIMITS.maxGridRowsPerElement },
        (_, index) => ({ id: `row_${index}` }),
      ),
      cells: {},
    };
    assert.throws(() => insertGridRow(tall, 0, sequentialIds()), /row limit/i);

    const wide: GridData = {
      columns: Array.from(
        { length: TEMPLATE_COMPLEXITY_LIMITS.maxGridColumnsPerElement },
        (_, index) => ({ id: `col_${index}`, key: `k${index}`, width: 1 }),
      ),
      rows: rows(1),
      cells: {},
    };
    assert.throws(() => insertGridColumn(wide, 0, sequentialIds()), /column limit/i);
  });
});
