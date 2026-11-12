import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  buildExportFilename,
  compareLocalizedText,
  formatAppDateTime,
  includesSearchText,
  normalizeSearchText,
} from '@/i18n/appFormatters.js';
import { DEFAULT_APP_LOCALE, setCurrentAppLocale } from '@/i18n/locales.js';

describe('app locale formatters', () => {
  afterEach(() => {
    setCurrentAppLocale(DEFAULT_APP_LOCALE);
  });

  it('normalizes search text before matching', () => {
    assert.equal(normalizeSearchText(' ＩＮＶＯＩＣＥ '), 'invoice');
    assert.equal(includesSearchText('标准日文发票', ' 日文 '), true);
  });

  it('sorts text with the app locale collator', () => {
    assert.deepEqual(['A10', 'A2', 'A1'].sort(compareLocalizedText), ['A1', 'A2', 'A10']);
  });

  it('formats app timestamps with an explicit app time zone', () => {
    assert.equal(formatAppDateTime('2026-07-13T00:00:00.000Z'), '2026年7月13日 09:00');
    setCurrentAppLocale('en-US');
    assert.equal(formatAppDateTime('2026-07-13T00:00:00.000Z'), 'Jul 13, 2026, 09:00');
  });

  it('builds export filenames without unsafe path characters', () => {
    assert.equal(buildExportFilename(' 見積/Alpha.json ', 'json'), '見積_Alpha.json');
    assert.equal(buildExportFilename('', '.pdf'), 'document.pdf');
  });
});
