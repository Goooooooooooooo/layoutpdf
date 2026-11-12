interface FontkitGlyph {
  id: number;
  codePoints: number[];
}

interface FontkitFont {
  characterSet: number[];
  glyphForCodePoint(codePoint: number): FontkitGlyph;
  layout(text: string): { glyphs: FontkitGlyph[] };
}

interface FontkitLike {
  create(data: Uint8Array, postscriptName?: string): FontkitFont;
}

const SYNTHETIC_CODE_POINT_START = 0x110000;

/**
 * pdf-lib builds widths and ToUnicode from font.characterSet. Some CJK fonts
 * shape mixed Latin/digit text into alternate glyphs that are not reachable
 * from that cmap. Expose those already-shaped glyphs through synthetic lookup
 * keys so pdf-lib embeds their real width and original Unicode mapping.
 */
export function createUnicodeAwareFontkit<T>(
  baseFontkit: T,
  renderedText: readonly string[],
): T {
  const compatibleFontkit = baseFontkit as unknown as FontkitLike;
  return {
    ...compatibleFontkit,
    create(data: Uint8Array, postscriptName?: string) {
      const font = compatibleFontkit.create(data, postscriptName);
      return exposeShapedGlyphs(font, renderedText);
    },
  } as unknown as T;
}

function exposeShapedGlyphs(
  font: FontkitFont,
  renderedText: readonly string[],
): FontkitFont {
  const cmapGlyphIds = new Set(
    font.characterSet.map(codePoint => font.glyphForCodePoint(codePoint).id),
  );
  const shapedGlyphs = new Map<number, FontkitGlyph>();
  for (const text of renderedText) {
    for (const glyph of font.layout(text).glyphs) {
      if (!cmapGlyphIds.has(glyph.id) && !shapedGlyphs.has(glyph.id)) {
        shapedGlyphs.set(glyph.id, glyph);
      }
    }
  }
  if (shapedGlyphs.size === 0) return font;

  const syntheticGlyphs = new Map<number, FontkitGlyph>();
  let syntheticCodePoint = SYNTHETIC_CODE_POINT_START;
  for (const glyph of shapedGlyphs.values()) {
    syntheticGlyphs.set(syntheticCodePoint, glyph);
    syntheticCodePoint += 1;
  }

  return new Proxy({} as FontkitFont, {
    get(_target, property) {
      if (property === 'characterSet') {
        return [...font.characterSet, ...syntheticGlyphs.keys()];
      }
      if (property === 'glyphForCodePoint') {
        return (codePoint: number) =>
          syntheticGlyphs.get(codePoint) ?? font.glyphForCodePoint(codePoint);
      }
      const value = (font as unknown as Record<PropertyKey, unknown>)[property];
      return typeof value === 'function' ? value.bind(font) : value;
    },
  });
}
