import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import { DEFAULT_APP_LOCALE, setCurrentAppLocale } from '@/i18n/locales.js';
import { enUSMessages } from '@/i18n/messages.en-US.js';
import { jaJPMessages } from '@/i18n/messages.ja-JP.js';
import { ensureCatalogs, formatMessage, t } from '@/i18n/messages.js';
import { zhCNMessages } from '@/i18n/messages.zh-CN.js';
import { resolveMessageLabel } from '@/i18n/labels.js';

describe('i18n messages', () => {
  before(async () => {
    await ensureCatalogs();
  });

  afterEach(() => {
    setCurrentAppLocale(DEFAULT_APP_LOCALE);
  });

  it('formats zh-CN UI messages with named values', () => {
    assert.equal(t('home.library.count', { localCount: 2, builtinCount: 3 }), '2 个我的模板 · 3 个内置模板');
    assert.equal(t('app.error.templateNotFound', { id: 'tpl_1' }), '模板不存在：tpl_1');
    assert.equal(t('editor.status.page', { current: 1, total: 4 }), '页面 1/4');
  });

  it('formats app messages in Japanese and English', () => {
    assert.equal(t('home.library.title', undefined, 'ja-JP'), 'テンプレートライブラリ');
    assert.equal(t('editor.primary.generatePdf', undefined, 'en-US'), 'Generate PDF');
    assert.equal(t('builtin.standardInvoice.label', undefined, 'en-US'), 'Standard Japanese invoice');
  });

  it('uses task-oriented Japanese terminology for business document workflows', () => {
    assert.equal(t('runner.title', undefined, 'ja-JP'), '帳票作成');
    assert.equal(t('runner.excel.exportTemplate', undefined, 'ja-JP'), 'Excelに出力');
    assert.equal(t('runner.excel.import', undefined, 'ja-JP'), 'Excelから読み込む');
    assert.equal(
      t('runner.export.recordsMerged', undefined, 'ja-JP'),
      'すべての帳票を1つのPDFにまとめる',
    );
    assert.equal(t('issueCenter.title', undefined, 'ja-JP'), 'エラー・警告');
  });

  it('uses the current app locale and localized plugin/property labels by default', () => {
    setCurrentAppLocale('en-US');
    assert.equal(t('home.library.sourceBuiltin'), 'Built-in');
    assert.equal(t('plugin.text.label'), 'Text');
    assert.equal(t('property.common.fontSize'), 'Font size');
  });

  it('keeps unresolved placeholders visible', () => {
    assert.equal(formatMessage('模板不存在：{id}'), '模板不存在：{id}');
  });

  it('resolves keyed labels while preserving fallback labels', () => {
    assert.equal(resolveMessageLabel({ label: 'Fallback', labelKey: 'plugin.text.label' }), '文字');
    assert.equal(resolveMessageLabel({ label: 'Fallback only' }), 'Fallback only');
  });

  it('covers every error.* message key in Japanese and English', () => {
    const errorKeys = Object.keys(zhCNMessages).filter((key) => key.startsWith('error.'));
    assert.ok(errorKeys.length > 0);

    for (const key of errorKeys) {
      assert.ok(key in enUSMessages, `missing en-US override for ${key}`);
      assert.ok(key in jaJPMessages, `missing ja-JP override for ${key}`);
    }
  });
});
