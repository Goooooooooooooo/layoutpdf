import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBlankTemplateFile, createId, type IdPrefix } from './document.js';

function deterministicId(prefix: IdPrefix): string {
  return `${prefix}_fixed`;
}

describe('createBlankTemplateFile', () => {
  it('creates a complete blank A4 template with stable injected ids', () => {
    const file = createBlankTemplateFile({ idGenerator: deterministicId, name: 'Invoice' });

    assert.equal(file.format, 'layoutpdf-template');
    assert.equal(file.version, 3);
    assert.equal(file.template.id, 'tpl_fixed');
    assert.equal(file.template.name, 'Invoice');
    assert.equal(file.template.pages[0].id, 'page_fixed');
    assert.deepEqual(file.template.pages[0].size, { width: 210, height: 297 });
    assert.deepEqual(file.template.pages[0].padding, [10, 10, 10, 10]);
    assert.deepEqual(file.template.pages[0].elements, []);
  });

  it('does not share mutable page size or padding inputs', () => {
    const pageSize = { width: 100, height: 200 };
    const padding: [number, number, number, number] = [1, 2, 3, 4];
    const file = createBlankTemplateFile({ idGenerator: deterministicId, pageSize, padding });

    pageSize.width = 999;
    padding[0] = 999;

    assert.equal(file.template.pages[0].size.width, 100);
    assert.equal(file.template.pages[0].padding[0], 1);
  });
});

describe('createId', () => {
  it('generates 12-char base36 ids with prefix', () => {
    const id = createId('el');
    const prefix = 'el_';
    assert.ok(id.startsWith(prefix));
    const body = id.slice(prefix.length);
    assert.equal(body.length, 12);
    assert.ok(/^[0-9a-z]{12}$/.test(body), `expected base36 body, got: ${body}`);
  });

  it('generates unique ids across calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => createId('el')));
    assert.equal(ids.size, 1000);
  });
});
