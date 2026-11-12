import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { fontkit } from './fontkitRuntime.js';
import { createFontManager } from './fontManager.js';

describe('createFontManager', () => {
  it('uses one font source for glyph checks, measurement, browser, and PDF embedding', async () => {
    const bytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));
    const manager = createFontManager({
      NotoCJK: { data: bytes, fallback: true, subset: true },
    });

    assert.equal(manager.getDefaultFontName(), 'NotoCJK');
    assert.equal(manager.getFontBytes('NotoCJK'), bytes);
    assert.doesNotThrow(() => manager.assertTextSupported('NotoCJK', '标签 金額 請求書\n株式会社'));
    assert.ok(manager.measureText('NotoCJK', '請求書', 12) > 0);
    assert.equal(await manager.ensureBrowserFont('NotoCJK'), 'NotoCJK');

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const first = await manager.embedPdfFont(pdfDoc, 'NotoCJK');
    const second = await manager.embedPdfFont(pdfDoc, 'NotoCJK');
    assert.equal(first, second);
  });

  it('resolves a real bold face in the same family and keeps synthetic fallback for single-face fonts', async () => {
    const [regular, bold] = await Promise.all([
      readFile('public/fonts/NotoSansCJKjp-Regular.otf'),
      readFile('public/fonts/NotoSansCJKjp-Bold.otf'),
    ]);
    const manager = createFontManager({
      NotoCJK: {
        data: new Uint8Array(regular),
        fallback: true,
        family: 'NotoCJK',
        weight: 'normal',
      },
      NotoCJKBold: {
        data: new Uint8Array(bold),
        family: 'NotoCJK',
        weight: 'bold',
      },
    });

    assert.deepEqual(manager.resolveFontFace?.('NotoCJK', 'normal'), {
      name: 'NotoCJK',
      syntheticBold: false,
    });
    assert.deepEqual(manager.resolveFontFace?.('NotoCJK', 'bold'), {
      name: 'NotoCJKBold',
      syntheticBold: false,
    });
    assert.ok(manager.measureText('NotoCJK', '請求書 Invoice', 12) > 0);
    assert.ok(manager.measureText('NotoCJKBold', '請求書 Invoice', 12) > 0);

    const singleFace = createFontManager({
      Custom: { data: new Uint8Array(regular), fallback: true },
    });
    assert.deepEqual(singleFace.resolveFontFace?.('Custom', 'bold'), {
      name: 'Custom',
      syntheticBold: true,
    });
  });

  it('applies the configured missing-glyph policy', async () => {
    const bytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));
    const reported: string[] = [];
    const warn = createFontManager(
      { Font: { data: bytes, fallback: true } },
      {
        missingGlyphPolicy: 'warn',
        onMissingGlyphs: (_name, missing) => reported.push(...missing),
      },
    );
    const originalWarn = console.warn;
    console.warn = () => undefined;
    try {
      assert.doesNotThrow(() => warn.assertTextSupported('Font', '😀'));
    } finally {
      console.warn = originalWarn;
    }
    assert.deepEqual(reported, ['😀']);

    const ignore = createFontManager(
      { Font: { data: bytes, fallback: true } },
      { missingGlyphPolicy: 'ignore', onMissingGlyphs: () => { throw new Error('unexpected'); } },
    );
    assert.doesNotThrow(() => ignore.assertTextSupported('Font', '😀'));

    const strict = createFontManager({ Font: { data: bytes, fallback: true } });
    assert.throws(() => strict.assertTextSupported('Font', '😀'), /missing glyphs/);
  });

  it('rejects empty and unknown font configurations', () => {
    assert.throws(() => createFontManager({}), /At least one binary font is required/);
    const manager = createFontManager({
      Font: { data: new Uint8Array([1]), fallback: true },
    });
    assert.throws(() => manager.getFontBytes('Missing'), /Unknown font: Missing/);
  });
});
