import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IdPrefix } from '../core/document.js';
import { createTemplateFileFromPdf } from './importPdfTemplate.js';
import { decodeBase64Asset } from '../utils/assets.js';

describe('createTemplateFileFromPdf', () => {
  it('stores one PDF asset and creates one source page reference per PDF page', () => {
    let id = 0;
    const file = createTemplateFileFromPdf({
      name: 'invoice.pdf',
      bytes: new Uint8Array([1, 2, 3, 4]),
      pageSizes: [{ width: 210, height: 297 }, { width: 100, height: 200 }],
      idGenerator: (prefix: IdPrefix) => `${prefix}_${id++}`,
    });

    assert.equal(file.template.name, 'invoice');
    assert.equal(file.template.pages.length, 2);
    assert.deepEqual(file.template.pages.map(page => page.background), [
      { kind: 'pdf', assetId: 'asset_0', pageIndex: 0 },
      { kind: 'pdf', assetId: 'asset_0', pageIndex: 1 },
    ]);
    assert.deepEqual(decodeBase64Asset(file.assets.asset_0), new Uint8Array([1, 2, 3, 4]));
  });

  it('rejects PDFs without pages', () => {
    assert.throws(() => createTemplateFileFromPdf({
      name: 'empty.pdf',
      bytes: new Uint8Array([1]),
      pageSizes: [],
    }), /at least one page/);
  });
});
