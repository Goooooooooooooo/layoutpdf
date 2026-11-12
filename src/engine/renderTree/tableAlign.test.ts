import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TableColumn } from './model.js';
import { defaultCellAlign, defaultHeaderAlign, resolveHeaderAlign } from './tableAlign.js';

describe('defaultCellAlign', () => {
  it('returns left for text', () => {
    assert.equal(defaultCellAlign('text'), 'left');
  });

  it('returns right for number', () => {
    assert.equal(defaultCellAlign('number'), 'right');
  });

  it('returns right for currency', () => {
    assert.equal(defaultCellAlign('currency'), 'right');
  });

  it('returns right for formula', () => {
    assert.equal(defaultCellAlign('formula'), 'right');
  });

  it('returns center for date', () => {
    assert.equal(defaultCellAlign('date'), 'center');
  });
});

describe('defaultHeaderAlign', () => {
  it('returns center', () => {
    assert.equal(defaultHeaderAlign(), 'center');
  });
});

describe('resolveHeaderAlign', () => {
  it('uses headerAlign when present', () => {
    const column: TableColumn = {
      id: 'amount',
      label: '金额',
      key: 'amount',
      width: 1,
      valueType: 'currency',
      align: 'right',
      headerAlign: 'center',
    };
    assert.equal(resolveHeaderAlign(column), 'center');
  });

  it('falls back to defaultHeaderAlign when headerAlign is absent', () => {
    const column: TableColumn = {
      id: 'amount',
      label: '金额',
      key: 'amount',
      width: 1,
      valueType: 'currency',
      align: 'right',
    };
    assert.equal(resolveHeaderAlign(column), 'center');
  });
});
