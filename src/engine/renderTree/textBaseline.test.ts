import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { textBaselineFromLineTopPt } from './textBaseline.js';
import { pdfPtToMm } from '@/engine/utils/units.js';

describe('textBaselineFromLineTopPt', () => {
  const metrics = { ascent: 0.8, descent: 0.2 };

  it('places the baseline using half-leading for 1.0, 1.5, and 3.0 line heights', () => {
    assert.ok(Math.abs(textBaselineFromLineTopPt(12, pdfPtToMm(12), metrics) - 9.6) < 0.0001);
    assert.ok(Math.abs(textBaselineFromLineTopPt(12, pdfPtToMm(18), metrics) - 12.6) < 0.0001);
    assert.ok(Math.abs(textBaselineFromLineTopPt(12, pdfPtToMm(36), metrics) - 21.6) < 0.0001);
  });

  it('falls back to common Latin metrics when the font manager exposes none', () => {
    assert.ok(Math.abs(textBaselineFromLineTopPt(10, pdfPtToMm(15), undefined) - 10.5) < 0.0001);
  });
});
