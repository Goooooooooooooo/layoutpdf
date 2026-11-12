import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hex2Rgb } from './color.js';

describe('hex2Rgb', () => {
  it('parses full 6-digit hex', () => {
    const c = hex2Rgb('#ff0000');
    assert.equal(c.r, 1);
    assert.equal(c.g, 0);
    assert.equal(c.b, 0);
  });

  it('parses 3-digit short hex', () => {
    const c = hex2Rgb('#ccc');
    assert.equal(c.r, 0.8);
    assert.equal(c.g, 0.8);
    assert.equal(c.b, 0.8);
  });

  it('parses short hex without hash', () => {
    const c = hex2Rgb('ccc');
    assert.equal(c.r, 0.8);
    assert.equal(c.g, 0.8);
    assert.equal(c.b, 0.8);
  });

  it('returns black for empty input', () => {
    const c = hex2Rgb('');
    assert.equal(c.r, 0);
    assert.equal(c.g, 0);
    assert.equal(c.b, 0);
  });
});
