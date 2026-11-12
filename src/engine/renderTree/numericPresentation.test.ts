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
