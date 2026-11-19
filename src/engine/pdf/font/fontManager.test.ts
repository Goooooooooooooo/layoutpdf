import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { fontkit } from './fontkitRuntime.js';
import { createFontManager } from './fontManager.js';
import { initWithBytes, subsetFontBytes } from './subsetFont.js';

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

  it('falls back to the next font for glyphs the primary face does not cover', async () => {
    const [notoBytes, wasmBytes] = await Promise.all([
      readFile('public/fonts/NotoSansCJKjp-Regular.otf'),
      readFile('public/fonts/hb-subset.wasm'),
    ]);
    await initWithBytes(new Uint8Array(wasmBytes));
    const latinCodePoints = new Set<number>();
    for (let codePoint = 0x20; codePoint <= 0x7e; codePoint += 1) latinCodePoints.add(codePoint);
    const latinBytes = await subsetFontBytes(new Uint8Array(notoBytes), latinCodePoints);
    const manager = createFontManager({
      Latin: { data: latinBytes, family: 'Latin', weight: 'normal' },
      Full: { data: new Uint8Array(notoBytes), fallback: true, family: 'Full' },
    });

    assert.deepEqual(manager.getFallbackChain?.('Latin'), ['Latin', 'Full']);
    const runs = manager.resolveTextRuns?.('Latin', 'Invoice 請求書');
    assert.equal(runs?.map(run => run.text).join(''), 'Invoice 請求書');
    assert.ok(runs?.some(run => run.fontName === 'Latin' && run.text.includes('Invoice')));
    assert.ok(runs?.some(run => run.fontName === 'Full' && run.text.includes('請求書')));
    assert.equal(
      manager.measureText('Latin', '請求書', 12),
      manager.measureText('Full', '請求書', 12),
    );
    assert.doesNotThrow(() => manager.assertTextSupported('Latin', 'Invoice 請求書'));

    const reported: string[] = [];
    const strict = createFontManager({
      Latin: { data: latinBytes, family: 'Latin', weight: 'normal' },
      Full: { data: new Uint8Array(notoBytes), fallback: true, family: 'Full' },
    }, { onMissingGlyphs: (_name, missing) => reported.push(...missing) });
    assert.throws(() => strict.assertTextSupported('Latin', 'Invoice 😀'), /missing glyphs/);
    assert.deepEqual(reported, ['😀']);
  });

  it('invalidates measurement and fallback caches when font bytes change', async () => {
    const [notoBytes, boldBytes, wasmBytes] = await Promise.all([
      readFile('public/fonts/NotoSansCJKjp-Regular.otf'),
      readFile('public/fonts/NotoSansCJKjp-Bold.otf'),
      readFile('public/fonts/hb-subset.wasm'),
    ]);
    await initWithBytes(new Uint8Array(wasmBytes));
    const latinCodePoints = new Set<number>();
    for (let codePoint = 0x20; codePoint <= 0x7e; codePoint += 1) latinCodePoints.add(codePoint);
    const latinBytes = await subsetFontBytes(new Uint8Array(notoBytes), latinCodePoints);
    const manager = createFontManager({
      Main: { data: new Uint8Array(notoBytes), fallback: true, family: 'Main' },
    });

    assert.doesNotThrow(() => manager.assertTextSupported('Main', '請求書'));
    const beforeCjk = manager.measureText('Main', '請求書', 12);
    const beforeLatin = manager.measureText('Main', 'Invoice', 12);

    // Coverage is cached from the full face; after the swap only Latin remains.
    manager.replaceFontBytes('Main', latinBytes);
    assert.throws(() => manager.assertTextSupported('Main', '請求書'), /missing glyphs/);

    // Widths are cached per face; the bold face has different Latin advances.
    manager.replaceFontBytes('Main', new Uint8Array(boldBytes));
    assert.notEqual(manager.measureText('Main', 'Invoice', 12), beforeLatin);

    manager.replaceFontBytes('Main', new Uint8Array(notoBytes));
    assert.doesNotThrow(() => manager.assertTextSupported('Main', '請求書'));
    assert.equal(manager.measureText('Main', '請求書', 12), beforeCjk);
    assert.equal(manager.measureText('Main', 'Invoice', 12), beforeLatin);
  });

  it('honours an explicit default font instead of the registration order', async () => {
    const bytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));
    const bold = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Bold.otf'));

    assert.equal(
      createFontManager({
        Regular: { data: bytes, fallback: true, family: 'Body', weight: 'normal' },
        Bold: { data: bold, family: 'Body', weight: 'bold' },
        Heading: { data: bold, family: 'Heading', weight: 'normal' },
      }).getDefaultFontName(),
      'Regular',
      'the fallback-marked face stays the default when nothing is configured',
    );

    const configured = createFontManager({
      Regular: { data: bytes, fallback: true, family: 'Body', weight: 'normal' },
      Bold: { data: bold, family: 'Body', weight: 'bold' },
      Heading: { data: bold, family: 'Heading', weight: 'normal' },
    }, { defaultFont: 'Heading' });
    assert.equal(configured.getDefaultFontName(), 'Heading');

    // The configured default does not need a fallback marker: every consumer
    // reads it through `getDefaultFontName()`, including layout and PDF drawing.
    assert.equal(configured.resolveFontFace?.('Heading', 'normal')?.name, 'Heading');
  });

  it('rejects an unknown default font with the available names', async () => {
    const bytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));
    assert.throws(
      () => createFontManager(
        { Regular: { data: bytes, fallback: true } },
        { defaultFont: 'Missing Face' },
      ),
      /Unknown default font "Missing Face"\. Available fonts: Regular\./,
    );
  });

  it('lists families in registration order with one default face each', async () => {
    const [regular, bold] = await Promise.all([
      readFile('public/fonts/NotoSansCJKjp-Regular.otf'),
      readFile('public/fonts/NotoSansCJKjp-Bold.otf'),
    ]);
    const manager = createFontManager({
      'Body Bold': { data: new Uint8Array(bold), family: 'Body', weight: 'bold' },
      'Body Regular': { data: new Uint8Array(regular), family: 'Body', weight: 'normal' },
      Mono: { data: new Uint8Array(regular), family: 'Mono' },
    });

    assert.deepEqual(manager.listFontFamilies?.(), [
      {
        family: 'Body',
        // The normal face wins even when the bold face was registered first,
        // so picking a family keeps the element's own weight toggle working.
        defaultFace: 'Body Regular',
        faces: [
          { name: 'Body Bold', weight: 'bold' },
          { name: 'Body Regular', weight: 'normal' },
        ],
      },
      {
        family: 'Mono',
        defaultFace: 'Mono',
        faces: [{ name: 'Mono', weight: 'normal' }],
      },
    ]);
  });

  it('rejects empty and unknown font configurations', () => {
    assert.throws(() => createFontManager({}), /At least one binary font is required/);
    const manager = createFontManager({
      Font: { data: new Uint8Array([1]), fallback: true },
    });
    assert.throws(() => manager.getFontBytes('Missing'), /Unknown font: Missing/);
  });
});
