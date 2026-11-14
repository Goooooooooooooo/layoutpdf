import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureTableRowIds } from './tableInput.js';

describe('ensureTableRowIds', () => {
  it('generates unique ids for rows that have none', () => {
    const rows = ensureTableRowIds([
      { name: 'A' },
      { id: '', name: 'B' },
      { id: 'kept', name: 'C' },
    ]);
    assert.equal(rows.length, 3);
    assert.equal(rows[2].id, 'kept');
    assert.ok(rows[0].id);
    assert.ok(rows[1].id);
    assert.notEqual(rows[0].id, rows[1].id);
  });

  it('repairs duplicate ids without reusing them', () => {
    const rows = ensureTableRowIds([
      { id: 'same', name: 'A' },
      { id: 'same', name: 'B' },
    ]);
    assert.notEqual(rows[0].id, rows[1].id);
    assert.equal(rows[0].id, 'same');
  });

  it('returns the original array when every id is already valid', () => {
    const input = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }];
    assert.equal(ensureTableRowIds(input), input);
  });
});
