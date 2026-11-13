import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDateValue, formatNumberValue } from '@/i18n/formatters.js';

describe('formatNumberValue', () => {
  it('applies an explicit suffix in number mode', () => {
    assert.equal(
      formatNumberValue(1234, {
        mode: 'number',
        locale: 'ja-JP',
        suffix: '円',
        decimalPlaces: 0,
      }),
      '1,234円',
    );
  });

  it('applies explicit affixes to calculated numbers', () => {
    assert.equal(
      formatNumberValue(98.765, {
        mode: 'number',
        locale: 'ja-JP',
        prefix: '税込 ',
        suffix: ' 円',
        decimalPlaces: 2,
      }),
      '税込 98.77 円',
    );
  });

  it('supports configurable negative currency styles', () => {
    const base = { mode: 'currency' as const, locale: 'ja-JP' as const, prefix: '¥', suffix: '' };
    assert.equal(formatNumberValue(-1000, base), '¥-1,000');
    assert.equal(
      formatNumberValue(-1000, { ...base, negativeStyle: 'minus-before-symbol' }),
      '-¥1,000',
    );
    assert.equal(
      formatNumberValue(-1000, { ...base, negativeStyle: 'parentheses' }),
      '(¥1,000)',
    );
    assert.equal(
      formatNumberValue(-1000, { ...base, negativeStyle: 'triangle' }),
      '▲¥1,000',
    );
  });

  it('normalises floating point residue and negative zero before display', () => {
    assert.equal(formatNumberValue(0.1 + 0.2, { decimalPlaces: 1 }), '0.3');
    assert.equal(formatNumberValue(-0.001, { decimalPlaces: 2 }), '0.00');
    assert.equal(formatNumberValue(-0.004, { decimalPlaces: 0 }), '0');
  });
});

describe('formatDateValue Japanese eras', () => {
  const japanese = {
    locale: 'ja-JP' as const,
    calendar: 'japanese' as const,
    format: 'long' as const,
  };

  it('uses the era that actually contains the date', () => {
    assert.equal(
      formatDateValue('1989-01-07', { ...japanese, era: 'heisei' }),
      '昭和64年1月7日',
    );
    assert.equal(
      formatDateValue('1989-01-08', { ...japanese, era: 'heisei' }),
      '平成元年1月8日',
    );
    assert.equal(
      formatDateValue('2019-04-30', { ...japanese, era: 'reiwa' }),
      '平成31年4月30日',
    );
    assert.equal(
      formatDateValue('2019-05-01', { ...japanese, era: 'reiwa' }),
      '令和元年5月1日',
    );
  });

  it('supports Showa, Taisho, and Meiji boundaries', () => {
    assert.equal(
      formatDateValue('1926-12-24', { ...japanese, era: 'showa' }),
      '大正15年12月24日',
    );
    assert.equal(
      formatDateValue('1926-12-25', { ...japanese, era: 'showa' }),
      '昭和元年12月25日',
    );
    assert.equal(
      formatDateValue('1912-07-29', { ...japanese, era: 'taisho' }),
      '明治45年7月29日',
    );
    assert.equal(
      formatDateValue('1912-07-30', { ...japanese, era: 'taisho' }),
      '大正元年7月30日',
    );
    assert.equal(
      formatDateValue('1868-01-25', { ...japanese, era: 'meiji' }),
      '明治元年1月25日',
    );
  });

  it('never prints an era year at or below zero', () => {
    assert.equal(
      formatDateValue('1868-01-24', { ...japanese, era: 'meiji' }),
      '1868年1月24日',
    );
  });

  it('rejects impossible calendar dates', () => {
    assert.equal(formatDateValue('2024-02-31', japanese), '2024-02-31');
    assert.equal(formatDateValue('2023-02-29', japanese), '2023-02-29');
    assert.equal(formatDateValue('2024-13-01', japanese), '2024-13-01');
    assert.equal(
      formatDateValue('2024-02-29', { locale: 'ja-JP', calendar: 'gregory', format: 'long' }),
      '2024年2月29日',
    );
  });

  it('keeps an explicit Gregorian era even when the document calendar is Japanese', () => {
    assert.equal(
      formatDateValue('2024-02-29', { ...japanese, era: 'seireki' }),
      '2024年2月29日',
    );
  });
});
