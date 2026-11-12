import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TableFooterStyle } from './model.js';
import {
  resolveTableFooterBorderEdges,
  toggleTableFooterBorderEdge,
} from './tableFooterBorders.js';

const style: TableFooterStyle = {
  borderPreset: 'outer',
  border: { width: 1, color: '#333333', style: 'solid' },
};

describe('table footer border presets', () => {
  it('resolves presets into stable semantic edges', () => {
    assert.deepEqual(resolveTableFooterBorderEdges(style), [
      'top',
      'bottom',
      'left',
      'right',
    ]);
    assert.deepEqual(resolveTableFooterBorderEdges({
      ...style,
      borderPreset: 'all',
    }), [
      'top',
      'bottom',
      'left',
      'right',
      'horizontal',
      'vertical',
    ]);
    assert.deepEqual(resolveTableFooterBorderEdges({
      ...style,
      borderPreset: 'none',
    }), []);
  });

  it('switches a preset to a normalized custom edge selection', () => {
    const withoutTop = toggleTableFooterBorderEdge(style, 'top');
    assert.equal(withoutTop.borderPreset, 'custom');
    assert.deepEqual(withoutTop.borderEdges, ['bottom', 'left', 'right']);

    const withVertical = toggleTableFooterBorderEdge(withoutTop, 'vertical');
    assert.deepEqual(withVertical.borderEdges, [
      'bottom',
      'left',
      'right',
      'vertical',
    ]);
  });
});
