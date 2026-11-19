import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FontFamilyInfo } from '@/engine/pdf/font/fontManager.js';
import { resolveFontSelection } from '@/editor/components/propertyPanel/fontSelection.js';

const families: FontFamilyInfo[] = [
  {
    family: 'Body',
    defaultFace: 'Body Regular',
    faces: [
      { name: 'Body Regular', weight: 'normal' },
      { name: 'Body Bold', weight: 'bold' },
    ],
  },
  {
    family: 'Mono',
    defaultFace: 'Mono',
    faces: [{ name: 'Mono', weight: 'normal' }],
  },
];

describe('resolveFontSelection', () => {
  it('offers an inherit option first and one option per family', () => {
    const selection = resolveFontSelection(families, '', 'Use default');

    assert.equal(selection.value, '');
    assert.deepEqual(selection.options, [
      { value: '', label: 'Use default' },
      { value: 'Body Regular', label: 'Body' },
      { value: 'Mono', label: 'Mono' },
    ]);
  });

  it('maps a bold face back to the family so the weight toggle still applies', () => {
    const selection = resolveFontSelection(families, 'Body Bold', 'Use default');

    assert.equal(selection.value, 'Body Regular');
  });

  it('accepts a hand-written family name', () => {
    const selection = resolveFontSelection(families, 'Body', 'Use default');

    assert.equal(selection.value, 'Body Regular');
  });

  it('keeps an unknown face visible instead of showing inherit', () => {
    const selection = resolveFontSelection(families, 'Uploaded Face', 'Use default');

    assert.equal(selection.value, 'Uploaded Face');
    assert.deepEqual(selection.options.at(-1), { value: 'Uploaded Face', label: 'Uploaded Face' });
  });

  it('returns only the inherit option when the manager exposes no families', () => {
    const selection = resolveFontSelection([], '', 'Use default');

    assert.deepEqual(selection.options, [{ value: '', label: 'Use default' }]);
  });
});
