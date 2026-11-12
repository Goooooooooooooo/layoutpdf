import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { copyPdfDataForWorker } from './pdfPageInfo.js';

describe('copyPdfDataForWorker', () => {
  it('gives pdfjs an isolated buffer that cannot consume caller bytes', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const workerBytes = copyPdfDataForWorker(bytes);

    workerBytes[0] = 9;
    assert.deepEqual(bytes, new Uint8Array([1, 2, 3]));
    assert.notEqual(workerBytes.buffer, bytes.buffer);
  });
});
