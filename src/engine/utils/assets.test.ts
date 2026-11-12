import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TemplateAsset } from '../core/document.js';
import {
  decodeBase64Asset,
  encodeBase64Asset,
  getBase64AssetByteLength,
  getImageDataUrlByteLength,
} from './assets.js';

function pdfAsset(data: string): TemplateAsset {
  return {
    kind: 'pdf',
    name: 'background.pdf',
    mimeType: 'application/pdf',
    dataEncoding: 'base64',
    data,
  };
}

describe('decodeBase64Asset', () => {
  it('decodes normalized base64 asset data', () => {
    assert.deepEqual(decodeBase64Asset(pdfAsset('AQID\nBA==')), new Uint8Array([1, 2, 3, 4]));
  });

  it('rejects empty and malformed asset data with asset context', () => {
    assert.throws(() => decodeBase64Asset(pdfAsset('')), /background\.pdf.*invalid base64/);
    assert.throws(() => decodeBase64Asset(pdfAsset('not-base64')), /background\.pdf.*invalid base64/);
  });

  it('round-trips binary asset data', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    assert.deepEqual(decodeBase64Asset(pdfAsset(encodeBase64Asset(bytes))), bytes);
  });

  it('calculates decoded size without allocating decoded output', () => {
    assert.equal(getBase64AssetByteLength(pdfAsset('AQIDBA==')), 4);
    assert.equal(getImageDataUrlByteLength('data:image/png;base64,AQIDBA=='), 4);
    assert.throws(() => getBase64AssetByteLength(pdfAsset('broken')), /invalid base64/);
    assert.throws(() => getImageDataUrlByteLength('https://example.test/image.png'), /PNG or JPEG/);
  });
});
