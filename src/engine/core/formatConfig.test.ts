import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import { createEngine } from '@/engine/createEngine.js';
import { resolveFormatLocaleSettings } from '@/i18n/locales.js';
import { datePlugin } from '@/plugins/date/date.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: () => 0,
  ensureBrowserFont: async () => 'default',
};

describe('engine format configuration', () => {
  it('derives locale defaults and lets explicit fields win', () => {
    assert.deepEqual(
      resolveFormatLocaleSettings('ja-JP', { locale: 'zh-CN' }),
      {
        locale: 'zh-CN',
        currency: 'CNY',
        calendar: 'gregory',
        timeZone: 'Asia/Shanghai',
      },
    );

    assert.deepEqual(
      resolveFormatLocaleSettings('ja-JP', {
        locale: 'zh-CN',
        currency: 'JPY',
        timeZone: 'Asia/Tokyo',
      }),
      {
        locale: 'zh-CN',
        currency: 'JPY',
        calendar: 'gregory',
        timeZone: 'Asia/Tokyo',
      },
    );
  });

  it('applies engine-level format to resolved documents and plugin output', () => {
    const engine = createEngine({
      plugins: [datePlugin],
      fontManager,
      format: {
        locale: 'zh-CN',
        currency: 'CNY',
        timeZone: 'Asia/Shanghai',
      },
    });

    const template = engine.createTemplate({ name: 'Locale test' })
      .addElement('date', {
        x: 10,
        y: 10,
        binding: { key: 'issueDate' },
      })
      .build();

    const preview = engine.createDocument(template, { issueDate: '2026-07-13' }).preview();

    assert.deepEqual(preview.format, {
      locale: 'zh-CN',
      currency: 'CNY',
      calendar: 'gregory',
      timeZone: 'Asia/Shanghai',
    });

    const textNode = preview.pages[0].nodes.find(node => node.kind === 'text');
    assert.ok(textNode?.kind === 'text');
    assert.equal(textNode.text, '2026年7月13日');
  });

  it('keeps template language as the base when no override is supplied', () => {
    const engine = createEngine({
      plugins: [datePlugin],
      fontManager,
    });

    const template = engine.createTemplate({ name: 'Template locale' })
      .addElement('date', { x: 0, y: 0, binding: { key: 'issueDate' } })
      .build();
    template.template.metadata = { language: 'en-US' };

    const preview = engine.createDocument(template, { issueDate: '2026-07-13' }).preview();
    assert.equal(preview.format.locale, 'en-US');
    assert.equal(preview.format.currency, 'USD');
    assert.equal(preview.format.timeZone, 'America/New_York');
  });
});
