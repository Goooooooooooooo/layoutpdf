import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatNumericPresentation } from './numericPresentation.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';

const format = defaultFormatSettingsForLocale('en-US');
const edge = {
  prefix: '$',
  symbolLayout: 'edge' as const,
  zeroDisplay: 'zero' as const,
  emptyDisplay: 'blank' as const,
};

describe('formatNumericPresentation', () => {
  it('keeps attached and edge symbol layouts distinct', () => {
    assert.deepEqual(
      formatNumericPresentation(1234, { ...edge, symbolLayout: 'attached' }, 0, format),
      { text: '$1,234' },
    );
    assert.deepEqual(
      formatNumericPresentation(1234, edge, 0, format),
      { text: '1,234', prefixText: '$' },
    );
  });

  it('lets the display format override the fallback decimal places', () => {
    assert.deepEqual(
      formatNumericPresentation(1234.5, { ...edge, decimalPlaces: 2 }, 0, format),
      { text: '1,234.50', prefixText: '$' },
    );
    assert.deepEqual(
      formatNumericPresentation(1234.5, { ...edge, decimalPlaces: 0 }, 2, format),
      { text: '1,235', prefixText: '$' },
    );
  });

  it('rounds before deciding whether a value is zero', () => {
    assert.deepEqual(
      formatNumericPresentation(0.004, { ...edge, zeroDisplay: 'blank', decimalPlaces: 2 }, 1, format),
      { text: '' },
    );
    assert.deepEqual(
      formatNumericPresentation(-0.004, { ...edge, zeroDisplay: 'zero', decimalPlaces: 2 }, 1, format),
      { text: '0.00', prefixText: '$' },
    );
  });

  it('keeps zero and missing values blank when no display format is set', () => {
    assert.deepEqual(formatNumericPresentation(0, undefined, 0, format), { text: '' });
    assert.deepEqual(formatNumericPresentation(0.004, undefined, 2, format), { text: '' });
    assert.deepEqual(formatNumericPresentation(null, undefined, 0, format), { text: '' });
    assert.deepEqual(formatNumericPresentation(undefined, undefined, 0, format), { text: '' });
    assert.deepEqual(formatNumericPresentation('', undefined, 0, format), { text: '' });
  });

  it('does not retain a prefix for blank or dash branches', () => {
    assert.deepEqual(formatNumericPresentation(null, edge, 0, format), { text: '' });
    assert.deepEqual(
      formatNumericPresentation(null, { ...edge, emptyDisplay: 'dash' }, 0, format),
      { text: '-' },
    );
    assert.deepEqual(
      formatNumericPresentation(0, { ...edge, zeroDisplay: 'blank' }, 0, format),
      { text: '' },
    );
    assert.deepEqual(
      formatNumericPresentation(0, { ...edge, zeroDisplay: 'dash' }, 0, format),
      { text: '-' },
    );
  });
});
