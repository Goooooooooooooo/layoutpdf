import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { JsonValue, TemplateElement } from './document.js';
import {
  createInputSet,
  getActiveInput,
  isMissingRequiredInput,
  resolveElementValue,
} from './input.js';

function element(value: JsonValue, bindingKey?: string): TemplateElement {
  return {
    id: 'el_1',
    type: 'text',
    name: 'Field',
    box: { x: 10, y: 10, width: 50, height: 10 },
    rotate: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    value,
    binding: bindingKey ? { key: bindingKey } : undefined,
    props: {},
  };
}

describe('resolveElementValue', () => {
  it('uses the template value when the element has no binding', () => {
    assert.equal(resolveElementValue(element('default'), { field: 'input' }), 'default');
  });

  it('uses the template value when the input key is absent', () => {
    assert.equal(resolveElementValue(element('default', 'field'), {}), 'default');
  });

  it('preserves explicit empty and false-like input values', () => {
    const cases: JsonValue[] = ['', 0, false, null, [], {}];
    for (const value of cases) {
      assert.deepEqual(resolveElementValue(element('default', 'field'), { field: value }), value);
    }
  });
});

describe('LayoutPDFInputSet', () => {
  it('always contains an active input record', () => {
    const inputSet = createInputSet([]);
    assert.deepEqual(inputSet.records, [{}]);
    assert.deepEqual(getActiveInput(inputSet), {});
  });

  it('returns the selected record', () => {
    const inputSet = createInputSet([{ id: 1 }, { id: 2 }]);
    inputSet.activeRecordIndex = 1;
    assert.deepEqual(getActiveInput(inputSet), { id: 2 });
  });
});

describe('isMissingRequiredInput', () => {
  it('treats absent, blank, null, and empty arrays as missing', () => {
    assert.equal(isMissingRequiredInput({}, 'field'), true);
    assert.equal(isMissingRequiredInput({ field: '  ' }, 'field'), true);
    assert.equal(isMissingRequiredInput({ field: null }, 'field'), true);
    assert.equal(isMissingRequiredInput({ field: [] }, 'field'), true);
  });

  it('preserves zero, false, and structured values as valid input', () => {
    assert.equal(isMissingRequiredInput({ field: 0 }, 'field'), false);
    assert.equal(isMissingRequiredInput({ field: false }, 'field'), false);
    assert.equal(isMissingRequiredInput({ field: {} }, 'field'), false);
  });
});
