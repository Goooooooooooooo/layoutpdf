import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fontkit } from '@/engine/pdf/font/fontkitRuntime.js';
import { createUnicodeAwareFontkit } from '@/engine/pdf/font/unicodeAwareFontkit.js';

describe('createUnicodeAwareFontkit', () => {
  it('exposes shaped glyphs that are absent from the source cmap', async () => {
    const bytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));
    const text = 'STMT-2026-07-001';
    const source = fontkit.create(bytes);
    const cmapGlyphIds = new Set(
      source.characterSet.map(codePoint => source.glyphForCodePoint(codePoint).id),
    );
    const missingGlyphs = source.layout(text).glyphs.filter(glyph =>
      !cmapGlyphIds.has(glyph.id)
    );
    assert.ok(missingGlyphs.length > 0, 'fixture must exercise uncoded shaped glyphs');

    const wrapped = createUnicodeAwareFontkit(fontkit, [text]).create(bytes);
    const embeddedGlyphs = new Map(
      wrapped.characterSet.map(codePoint => {
        const glyph = wrapped.glyphForCodePoint(codePoint);
        return [glyph.id, glyph];
      }),
    );
    for (const glyph of missingGlyphs) {
      assert.deepEqual(embeddedGlyphs.get(glyph.id)?.codePoints, glyph.codePoints);
    }
  });
});
