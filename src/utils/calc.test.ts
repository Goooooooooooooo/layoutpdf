import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateExpression, evaluateFormula } from '@/utils/calc.js';

const noFields = { resolve: () => undefined };

describe('decimal-safe formula rounding', () => {
  it('rounds decimal input without exposing binary floating-point noise', () => {
    assert.equal(evaluateExpression('ROUND(1.005, 2)'), 1.01);
    assert.equal(evaluateExpression('ROUND(-2.5, 0)'), -3);
    assert.equal(evaluateExpression('ROUNDUP(100 * 1.1, 0)'), 110);
    assert.equal(evaluateExpression('ROUNDDOWN(0.29 * 100, 0)'), 29);
  });

  it('keeps the directional rounding functions away from floating-point noise', () => {
    assert.equal(evaluateExpression('FLOOR(0.29 * 100, 0)'), 29);
    assert.equal(evaluateExpression('CEIL(100 * 1.1, 0)'), 110);
    assert.equal(evaluateExpression('ROUNDUP(-0.29 * 100, 0)'), -29);
    assert.equal(evaluateExpression('ROUNDDOWN(-0.29 * 100, 0)'), -29);
  });

  it('never returns negative zero', () => {
    const value = evaluateFormula('ROUND(-0.4, 0)', noFields);
    assert.equal(Object.is(value, -0), false);
    assert.equal(value, 0);
  });

  it('rounds the final result with the same helper', () => {
    assert.equal(evaluateFormula('0.1 + 0.2', noFields, 2), 0.3);
    assert.equal(evaluateFormula('1.005', noFields, 2), 1.01);
  });
});

describe('floating point formula equality', () => {
  it('treats values within numeric tolerance as equal', () => {
    assert.equal(evaluateExpression('IF(0.1 + 0.2 = 0.3, 1, 0)'), 1);
    assert.equal(evaluateExpression('IF(0.1 + 0.2 != 0.3, 1, 0)'), 0);
  });

  it('treats a near-zero condition as false', () => {
    assert.equal(evaluateExpression('IF(0.1 + 0.2 - 0.3, 1, 0)'), 0);
    assert.equal(evaluateExpression('IF(0.1 + 0.2 - 0.3 = 0, 1, 0)'), 1);
  });
});
