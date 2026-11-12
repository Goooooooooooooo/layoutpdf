import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import { LayoutPDFRuntimeError, type RenderIssue } from '@/engine/utils/errors.js';
import { formatCaughtError, formatErrorCodeMessage, formatRenderIssue } from '@/i18n/errors.js';
import { DEFAULT_APP_LOCALE, setCurrentAppLocale } from '@/i18n/locales.js';
import { ensureCatalogs } from '@/i18n/messages.js';

describe('i18n error messages', () => {
  before(async () => {
    await ensureCatalogs();
  });

  afterEach(() => {
    setCurrentAppLocale(DEFAULT_APP_LOCALE);
  });

  it('maps stable runtime error codes to localized messages', () => {
    const error = new LayoutPDFRuntimeError(
      'TEMPLATE_NOT_FOUND',
      'Template not found: tpl_1',
      { id: 'tpl_1' },
    );
    assert.equal(formatCaughtError(error), '模板不存在：tpl_1');
  });

  it('formats runtime errors in English and Japanese', () => {
    const error = new LayoutPDFRuntimeError(
      'TEMPLATE_NOT_FOUND',
      'Template not found: tpl_1',
      { id: 'tpl_1' },
    );

    setCurrentAppLocale('en-US');
    assert.equal(formatCaughtError(error), 'Template not found: tpl_1');

    setCurrentAppLocale('ja-JP');
    assert.equal(formatCaughtError(error), 'テンプレートが見つかりません：tpl_1');
  });

  it('formats RenderIssue codes without relying on raw English messages', () => {
    const issue: RenderIssue = {
      severity: 'error',
      code: 'MISSING_REQUIRED_INPUT',
      message: 'Required input is missing: customer',
      inputKey: 'customer',
    };
    assert.equal(formatRenderIssue(issue), '必填数据缺失：customer');

    setCurrentAppLocale('en-US');
    assert.equal(formatRenderIssue(issue), 'Required input is missing: customer');

    setCurrentAppLocale('ja-JP');
    assert.equal(formatRenderIssue(issue), '必須項目が入力されていません：customer');
  });

  it('keeps unmapped error detail visible with the code', () => {
    assert.equal(formatErrorCodeMessage('NEW_CODE', {}, 'raw detail'), 'NEW_CODE：raw detail');

    setCurrentAppLocale('en-US');
    assert.equal(formatErrorCodeMessage('NEW_CODE', {}, 'raw detail'), 'NEW_CODE: raw detail');
  });

  it('localizes row and footer table formula failures with their root cause', () => {
    const rowIssue: RenderIssue = {
      severity: 'error',
      code: 'TABLE_FORMULA_EVALUATION_FAILED',
      message: 'Formula result is not finite.',
      values: {
        formulaTarget: 'row',
        rowNumber: 2,
        columnLabel: '金额',
        detail: 'Formula result is not finite.',
      },
    };
    const footerIssue: RenderIssue = {
      severity: 'error',
      code: 'TABLE_FORMULA_EVALUATION_FAILED',
      message: 'column.amount is not numeric.',
      values: {
        formulaTarget: 'footer',
        footerLabel: '合计',
        detail: 'column.amount is not numeric.',
      },
    };

    assert.equal(
      formatRenderIssue(rowIssue),
      '表格第 2 行“金额”公式计算失败：Formula result is not finite.',
    );
    assert.equal(
      formatRenderIssue(footerIssue),
      '表格汇总“合计”计算失败：column.amount is not numeric.',
    );

    setCurrentAppLocale('en-US');
    assert.equal(
      formatRenderIssue(rowIssue),
      'Formula evaluation failed in row 2, “金额”: Formula result is not finite.',
    );

    setCurrentAppLocale('ja-JP');
    assert.equal(
      formatRenderIssue(footerIssue),
      '表の集計「合计」を計算できませんでした：column.amount is not numeric.',
    );
  });
});
