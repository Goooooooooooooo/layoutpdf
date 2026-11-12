import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cssPxToMm, mmToCssPx, mmToPdfPt, pdfPtToMm, ptToCssPx } from './units.js';

describe('render units', () => {
  it('converts millimeters and PDF points', () => {
    assert.ok(Math.abs(mmToPdfPt(25.4) - 72) < 1e-10);
    assert.ok(Math.abs(pdfPtToMm(72) - 25.4) < 1e-10);
  });

  it('converts millimeters and points to CSS pixels with zoom', () => {
    assert.ok(Math.abs(mmToCssPx(25.4) - 96) < 1e-10);
    assert.ok(Math.abs(ptToCssPx(12) - 16) < 1e-10);
    assert.ok(Math.abs(ptToCssPx(12, 2) - 32) < 1e-10);
  });

  it('round-trips CSS pixels and millimeters', () => {
    assert.ok(Math.abs(cssPxToMm(mmToCssPx(123.45, 1.5), 1.5) - 123.45) < 1e-10);
  });

  it('rejects invalid zoom when converting back to millimeters', () => {
    assert.throws(() => cssPxToMm(10, 0), /Zoom must be greater than zero/);
  });
});
