import type { PDFDocument, PDFFont } from 'pdf-lib';
import type { LayoutPDFFont } from '@/engine/utils/fontTypes.js';
import type { TextFontRun } from '@/engine/renderTree/model.js';
import { fontkit } from '@/engine/pdf/font/fontkitRuntime.js';

export interface FontVerticalMetrics {
  /** Ascent in em units (1 = font size). */
  ascent: number;
  /** Descent magnitude in em units (positive). */
  descent: number;
}

export interface FontManager {
  getDefaultFontName(): string;
  getFontBytes(name: string): Uint8Array;
  assertTextSupported(name: string, text: string): void;
  /** Returns the text width in PDF points for the requested point size. */
  measureText(name: string, text: string, sizePt: number): number;
  ensureBrowserFont(name: string): Promise<string>;
  resolveFontFace?(name: string, weight: 'normal' | 'bold'): ResolvedFontFace;
  /** Vertical font metrics used to place glyph baselines consistently in PDF and DOM. */
  getFontMetrics?(name: string): FontVerticalMetrics;
  /**
   * Faces to try, in order, when `name` does not cover a character. The first
   * entry is `name` itself. Omitted by custom managers, which then keep the
   * single-face behaviour.
   */
  getFallbackChain?(name: string): string[];
  /**
   * Splits `text` into contiguous runs, assigning each run the first face in
   * the fallback chain that covers it. Concatenating `run.text` restores the
   * input exactly.
   */
  resolveTextRuns?(name: string, text: string): TextFontRun[];
}

export interface PdfFontManager extends FontManager {
  embedPdfFont(pdfDocument: unknown, name: string): Promise<unknown>;
  replaceFontBytes(name: string, bytes: Uint8Array): void;
}

interface ParsedFont {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  hasGlyphForCodePoint(codePoint: number): boolean;
  layout(text: string): {
    glyphs: Array<{ advanceWidth: number }>;
  };
}

interface FontEntry {
  bytes: Uint8Array;
  subset: boolean;
  family: string;
  weight: 'normal' | 'bold';
  fallback: boolean;
}

export interface ResolvedFontFace {
  name: string;
  syntheticBold: boolean;
}

export function resolveFontFace(
  fontManager: FontManager,
  name: string,
  weight: 'normal' | 'bold',
): ResolvedFontFace {
  return fontManager.resolveFontFace?.(name, weight) ?? {
    name,
    syntheticBold: weight === 'bold',
  };
}

export async function ensureBrowserFontFaces(
  fontManager: FontManager,
  name = fontManager.getDefaultFontName(),
): Promise<void> {
  const names = new Set<string>();
  const chain = fontManager.getFallbackChain?.(name) ?? [name];
  for (const faceName of chain) {
    names.add(resolveFontFace(fontManager, faceName, 'normal').name);
    names.add(resolveFontFace(fontManager, faceName, 'bold').name);
  }
  await Promise.all([...names].map(faceName => fontManager.ensureBrowserFont(faceName)));
}

/** Keeps the process-local font caches bounded while documents keep varying. */
const MAX_CACHE_ENTRIES = 1024;

function cacheSet<K, V>(cache: Map<K, V>, key: K, value: V): V {
  if (!cache.has(key) && cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

let graphemeSegmenter: Intl.Segmenter | null | undefined;

function splitGraphemes(text: string): string[] {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      : null;
  }
  if (!graphemeSegmenter) return Array.from(text);
  return Array.from(graphemeSegmenter.segment(text), part => part.segment);
}

function toBytes(data: unknown, name: string): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw new Error(`Font "${name}" does not contain binary OTF/TTF data.`);
}

export interface FontManagerOptions {
  /**
   * What `assertTextSupported` does when a glyph is missing.
   * - `throw` (default): fail rendering with a descriptive error.
   * - `warn`: log to the console and let the caller continue.
   * - `ignore`: skip the check entirely.
   */
  missingGlyphPolicy?: 'throw' | 'warn' | 'ignore';
  /** Called for every missing-glyph check before the policy is applied. */
  onMissingGlyphs?(fontName: string, missing: readonly string[]): void;
}

export function createFontManager(
  fonts: LayoutPDFFont,
  options: FontManagerOptions = {},
): PdfFontManager {
  const entries = new Map<string, FontEntry>();
  for (const [name, entry] of Object.entries(fonts)) {
    if (!entry.data) continue;
    entries.set(name, {
      bytes: toBytes(entry.data, name),
      // Keep pdf-lib's internal subsetter off for CJK. renderDocumentPdf may
      // still embed a prebuilt, validated HarfBuzz subset through this path.
      subset: entry.subset ?? false,
      family: entry.family ?? name,
      weight: entry.weight ?? 'normal',
      fallback: entry.fallback ?? false,
    });
  }

  const defaultFontName = Object.entries(fonts).find(([, entry]) => entry.fallback)?.[0]
    ?? entries.keys().next().value;
  if (!defaultFontName || !entries.has(defaultFontName)) {
    throw new Error('At least one binary font is required.');
  }

  const parsedFonts = new Map<string, ParsedFont>();
  const browserFonts = new Map<string, Promise<string>>();
  const embeddedFonts = new WeakMap<object, Map<string, Promise<PDFFont>>>();
  const fallbackChains = new Map<string, string[]>();
  const glyphCoverage = new Map<string, boolean>();
  const measuredTexts = new Map<string, number>();
  const textRuns = new Map<string, TextFontRun[]>();

  function requireEntry(name: string): FontEntry {
    const entry = entries.get(name);
    if (!entry) throw new Error(`Unknown font: ${name}`);
    return entry;
  }

  function parsed(name: string): ParsedFont {
    const cached = parsedFonts.get(name);
    if (cached) return cached;
    const result = fontkit.create(requireEntry(name).bytes) as unknown as ParsedFont;
    parsedFonts.set(name, result);
    return result;
  }

  function getFallbackChain(name: string): string[] {
    const cached = fallbackChains.get(name);
    if (cached) return cached;
    const requested = requireEntry(name);
    // A different weight of the same family is never a glyph fallback; it is
    // the same coverage with another style. Fallback faces come from other
    // families, preferring the ones a host explicitly marked as fallbacks.
    const candidates = [...entries.entries()].filter(([candidate, entry]) =>
      candidate !== name && entry.family !== requested.family
    );
    const chain = [
      name,
      ...candidates.filter(([, entry]) => entry.fallback).map(([candidate]) => candidate),
      ...candidates.filter(([, entry]) => !entry.fallback).map(([candidate]) => candidate),
    ];
    return cacheSet(fallbackChains, name, chain);
  }

  function hasGlyph(name: string, codePoint: number): boolean {
    const key = `${name}\u0000${codePoint}`;
    const cached = glyphCoverage.get(key);
    if (cached !== undefined) return cached;
    let covered = false;
    try {
      covered = parsed(name).hasGlyphForCodePoint(codePoint);
    } catch {
      // Bytes that cannot be parsed cover nothing, same as a missing face.
    }
    return cacheSet(glyphCoverage, key, covered);
  }

  function resolveTextRuns(name: string, text: string): TextFontRun[] {
    if (!text) return [];
    const key = `${name}\u0000${text}`;
    const cached = textRuns.get(key);
    if (cached) return cached;

    const chain = getFallbackChain(name);
    const runs: TextFontRun[] = [];
    let current = '';
    let buffer = '';

    for (const grapheme of splitGraphemes(text)) {
      const codePoints = Array.from(grapheme, char => char.codePointAt(0)!);
      let fontName: string;
      if (codePoints.every(codePoint => /\s/u.test(String.fromCodePoint(codePoint)))) {
        fontName = current || name;
      } else {
        fontName = chain.find(candidate =>
          codePoints.every(codePoint => hasGlyph(candidate, codePoint))
        ) ?? name;
      }
      if (fontName !== current) {
        if (buffer) runs.push({ text: buffer, fontName: current });
        current = fontName;
        buffer = grapheme;
      } else {
        buffer += grapheme;
      }
    }
    if (buffer) runs.push({ text: buffer, fontName: current });
    return cacheSet(textRuns, key, runs);
  }

  function measureSingle(name: string, text: string, sizePt: number): number {
    if (!text) return 0;
    const key = `${name}\u0000${sizePt}\u0000${text}`;
    const cached = measuredTexts.get(key);
    if (cached !== undefined) return cached;
    const font = parsed(name);
    const advance = font.layout(text).glyphs.reduce((sum, glyph) => sum + glyph.advanceWidth, 0);
    return cacheSet(measuredTexts, key, advance / font.unitsPerEm * sizePt);
  }

  return {
    getDefaultFontName() {
      return defaultFontName;
    },

    getFontBytes(name) {
      return requireEntry(name).bytes;
    },

    getFontMetrics(name) {
      const font = parsed(name);
      if (!(font.unitsPerEm > 0) || !Number.isFinite(font.ascent) || !Number.isFinite(font.descent)) {
        return { ascent: 0.8, descent: 0.2 };
      }
      return {
        ascent: font.ascent / font.unitsPerEm,
        descent: Math.abs(font.descent) / font.unitsPerEm,
      };
    },

    getFallbackChain,

    resolveTextRuns,

    assertTextSupported(name, text) {
      const policy = options.missingGlyphPolicy ?? 'throw';
      if (policy === 'ignore') return;
      const chain = getFallbackChain(name);
      const missing = Array.from(new Set(Array.from(text)))
        .filter(char => !/[\r\n\t]/.test(char))
        .filter(char => {
          const codePoint = char.codePointAt(0)!;
          return !chain.some(candidate => hasGlyph(candidate, codePoint));
        });
      if (missing.length === 0) return;
      options.onMissingGlyphs?.(name, missing);
      if (policy === 'warn') {
        console.warn(`Font "${name}" is missing glyphs: ${missing.join(', ')}`);
        return;
      }
      throw new Error(`Font "${name}" is missing glyphs: ${missing.join(', ')}`);
    },

    measureText(name, text, sizePt) {
      if (!text) return 0;
      return resolveTextRuns(name, text)
        .reduce((width, run) => width + measureSingle(run.fontName, run.text, sizePt), 0);
    },

    resolveFontFace(name, weight) {
      const requested = requireEntry(name);
      const match = [...entries.entries()].find(([, entry]) =>
        entry.family === requested.family && entry.weight === weight
      );
      if (match) return { name: match[0], syntheticBold: false };
      return { name, syntheticBold: weight === 'bold' };
    },

    ensureBrowserFont(name) {
      const cached = browserFonts.get(name);
      if (cached) return cached;

      const promise = (async () => {
        if (typeof FontFace === 'undefined' || typeof document === 'undefined') return name;
        const bytes = requireEntry(name).bytes;
        const face = new FontFace(name, bytes.slice().buffer);
        await face.load();
        document.fonts.add(face);
        return name;
      })();
      browserFonts.set(name, promise);
      return promise;
    },

    replaceFontBytes(name, bytes) {
      const entry = entries.get(name);
      if (entry) entries.set(name, { ...entry, bytes, subset: false });
      parsedFonts.delete(name);
      // Coverage and widths depend on the bytes, not just the name. Drop every
      // derived cache so restoring the original bytes measures exactly as
      // before the temporary subset was installed.
      glyphCoverage.clear();
      measuredTexts.clear();
      textRuns.clear();
      browserFonts.delete(name);
    },

    embedPdfFont(pdfDocument, name) {
      const pdfDoc = pdfDocument as PDFDocument;
      let documentCache = embeddedFonts.get(pdfDoc);
      if (!documentCache) {
        documentCache = new Map();
        embeddedFonts.set(pdfDoc, documentCache);
      }
      const cached = documentCache.get(name);
      if (cached) return cached;

      const entry = requireEntry(name);
      const promise = pdfDoc.embedFont(entry.bytes, { subset: entry.subset });
      documentCache.set(name, promise);
      return promise;
    },
  };
}
