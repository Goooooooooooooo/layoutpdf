import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import { resolveFontFace } from '@/engine/pdf/font/fontManager.js';
import { pdfPtToMm } from '@/engine/utils/units.js';
import type {
  TextFontRun,
  TextLayout,
  TextLayoutLine,
  TextNode,
} from '@/engine/renderTree/model.js';

export interface MeasuredLine {
  text: string;
  width: number;
  /** Present only when the line needs a face other than `fontName`. */
  runs?: TextFontRun[];
}

/**
 * Runs are persisted only when they add information: a line entirely covered
 * by its requested face keeps the historical single-font shape.
 */
export function resolveTextLineRuns(
  fontManager: FontManager,
  fontName: string,
  text: string,
): TextFontRun[] | undefined {
  if (!text) return undefined;
  const runs = fontManager.resolveTextRuns?.(fontName, text);
  if (!runs || runs.length === 0) return undefined;
  if (runs.length === 1 && runs[0].fontName === fontName) return undefined;
  return runs;
}

// Shared font metrics and backend coordinate rounding can differ by a few hundredths
// of a millimeter. Treat that sub-visual delta as an exact fit instead of reporting
// a warning for text that remains visibly inside its element.
const TEXT_OVERFLOW_TOLERANCE_MM = 0.05;

function measureMm(
  fontManager: FontManager,
  fontName: string,
  text: string,
  fontSize: number,
): number {
  return pdfPtToMm(fontManager.measureText(fontName, text, fontSize));
}

interface WrapToken {
  text: string;
  whitespace: boolean;
  cjk: boolean;
}

const CJK_GRAPHEME = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WHITESPACE_TOKEN = /^\s+$/u;

// 行頭禁則: characters that may not begin a line.
const LINE_START_PROHIBITED = new Set([
  ')', ']', '}', '）', '］', '｝', '〉', '》', '」', '』', '】', '〕', '〗', '〙', '〛',
  '”', '’', '»',
  '、', '。', '，', '．', '・', '：', '；', '？', '！', '…', '‥',
  'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'っ', 'ゃ', 'ゅ', 'ょ', 'ゎ', 'ゕ', 'ゖ',
  'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ッ', 'ャ', 'ュ', 'ョ', 'ヮ', 'ヵ', 'ヶ',
  'ゝ', 'ゞ', 'ヽ', 'ヾ', '々', 'ー', '～', '〜',
  ',', '.', ':', ';', '!', '?', '%', '‰', '℃', '°',
]);

// 行末禁則: characters that may not end a line.
const LINE_END_PROHIBITED = new Set([
  '(', '[', '{', '（', '［', '｛', '〈', '《', '「', '『', '【', '〔', '〖', '〘', '〚',
  '“', '‘', '«', '￥', '＄', '$', '£', '€', '¥',
]);

let wordSegmenter: Intl.Segmenter | undefined;
let graphemeSegmenter: Intl.Segmenter | undefined;
let segmenterUnavailable = false;

function getWordSegmenter(): Intl.Segmenter | undefined {
  if (wordSegmenter || segmenterUnavailable) return wordSegmenter;
  try {
    wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  } catch {
    segmenterUnavailable = true;
  }
  return wordSegmenter;
}

function splitGraphemes(text: string): string[] {
  if (!graphemeSegmenter && !segmenterUnavailable) {
    try {
      graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    } catch {
      segmenterUnavailable = true;
    }
  }
  return graphemeSegmenter
    ? [...graphemeSegmenter.segment(text)].map(part => part.segment)
    : Array.from(text);
}

function firstCharacter(text: string): string {
  return Array.from(text)[0] ?? '';
}

function startsWithProhibited(text: string): boolean {
  return LINE_START_PROHIBITED.has(firstCharacter(text));
}

function endsWithProhibited(text: string): boolean {
  const graphemes = splitGraphemes(text);
  return LINE_END_PROHIBITED.has(graphemes[graphemes.length - 1] ?? '');
}

/**
 * Latin words stay whole, CJK graphemes stay individually breakable, and
 * punctuation that may not start a line is attached to the preceding word so
 * the break never lands in front of it.
 */
function tokenizeForWrapping(paragraph: string): WrapToken[] {
  const segmenter = getWordSegmenter();
  const segments = segmenter
    ? [...segmenter.segment(paragraph)].map(part => part.segment)
    : [paragraph];
  const tokens: WrapToken[] = [];
  for (const segment of segments) {
    if (WHITESPACE_TOKEN.test(segment)) {
      tokens.push({ text: segment, whitespace: true, cjk: false });
      continue;
    }
    let run = '';
    const flush = () => {
      if (run === '') return;
      tokens.push({ text: run, whitespace: false, cjk: false });
      run = '';
    };
    for (const grapheme of splitGraphemes(segment)) {
      if (CJK_GRAPHEME.test(grapheme)) {
        flush();
        tokens.push({ text: grapheme, whitespace: false, cjk: true });
      } else {
        run += grapheme;
      }
    }
    flush();
  }

  const merged: WrapToken[] = [];
  for (const token of tokens) {
    const previous = merged[merged.length - 1];
    const attaches = !token.whitespace
      && !token.cjk
      && previous !== undefined
      && !previous.whitespace
      && !previous.cjk
      && (startsWithProhibited(token.text) || token.text === '-');
    if (attaches) {
      merged[merged.length - 1] = { ...previous, text: previous.text + token.text };
    } else {
      merged.push(token);
    }
  }
  return merged;
}

function joinTokens(tokens: readonly WrapToken[], start: number, end: number): string {
  let text = '';
  for (let index = start; index < end; index += 1) text += tokens[index].text;
  return text;
}

function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  fontManager: FontManager,
  fontName: string,
  fontSize: number,
): MeasuredLine[] {
  if (paragraph === '') return [{ text: '', width: 0 }];

  const measure = (text: string) => measureMm(fontManager, fontName, text, fontSize);
  const tokens: WrapToken[] = [];
  for (const token of tokenizeForWrapping(paragraph)) {
    if (token.whitespace || measure(token.text) <= maxWidth) {
      tokens.push(token);
      continue;
    }
    // A single word wider than the line has to be split after all.
    for (const grapheme of splitGraphemes(token.text)) {
      tokens.push({ text: grapheme, whitespace: false, cjk: CJK_GRAPHEME.test(grapheme) });
    }
  }
  if (tokens.length === 0) return [{ text: '', width: 0 }];

  const lines: MeasuredLine[] = [];
  let start = 0;
  while (start < tokens.length) {
    while (start < tokens.length && tokens[start].whitespace) start += 1;
    if (start >= tokens.length) break;

    let low = start + 1;
    let high = tokens.length;
    let end = start;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (measure(joinTokens(tokens, start, middle)) <= maxWidth) {
        end = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (end === start) end = start + 1;

    if (end < tokens.length) {
      // Move the break to a legal position without dropping a fitting line
      // unless kinsoku requires it.
      for (let guard = 0; guard <= tokens.length; guard += 1) {
        const nextProhibited = startsWithProhibited(tokens[end].text);
        const previousProhibited = endsWithProhibited(tokens[end - 1].text);
        if (!nextProhibited && !previousProhibited) break;
        if (end > start + 1) {
          end -= 1;
          continue;
        }
        // The line holds a single token: keep the pair together.
        end = Math.min(tokens.length, end + 1);
        break;
      }
    }

    const text = joinTokens(tokens, start, end).replace(/\s+$/u, '');
    if (text !== '') {
      const runs = resolveTextLineRuns(fontManager, fontName, text);
      lines.push({
        text,
        width: measure(text),
        ...(runs ? { runs } : {}),
      });
    }
    start = end;
  }
  return lines.length > 0 ? lines : [{ text: '', width: 0 }];
}

/**
 * Measure final visual lines with the same font and Unicode-safe wrapping used by
 * standalone text nodes. Table measurement calls this before pagination so row
 * allocation and backend drawing consume one authoritative set of line breaks.
 */
export function wrapMeasuredText(
  text: string,
  maxWidth: number,
  fontManager: FontManager,
  fontName: string,
  fontSize: number,
): MeasuredLine[] {
  fontManager.assertTextSupported(fontName, text);
  return text
    .split(/\r?\n/)
    .flatMap(paragraph => wrapParagraph(
      paragraph,
      Math.max(0, maxWidth),
      fontManager,
      fontName,
      fontSize,
    ));
}

function resolveLineX(
  align: TextNode['style']['align'],
  paddingLeft: number,
  contentWidth: number,
  lineWidth: number,
): number {
  if (align === 'center') return paddingLeft + Math.max(0, (contentWidth - lineWidth) / 2);
  if (align === 'right') return paddingLeft + Math.max(0, contentWidth - lineWidth);
  return paddingLeft;
}

function resolveBlockY(
  verticalAlign: TextNode['style']['verticalAlign'],
  paddingTop: number,
  contentHeight: number,
  textHeight: number,
): number {
  const availableOffset = Math.max(0, contentHeight - textHeight);
  if (verticalAlign === 'middle') return paddingTop + availableOffset / 2;
  if (verticalAlign === 'bottom') return paddingTop + availableOffset;
  return paddingTop;
}

export function createTextLayout(node: TextNode, fontManager: FontManager): TextLayout {
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = node.style.padding;
  const contentWidth = Math.max(0, node.box.width - paddingLeft - paddingRight);
  const contentHeight = Math.max(0, node.box.height - paddingTop - paddingBottom);
  const requestedFontName = node.style.fontName || fontManager.getDefaultFontName();
  const fontName = resolveFontFace(fontManager, requestedFontName, node.style.fontWeight).name;
  const lineHeightMm = pdfPtToMm(node.style.fontSize * node.style.lineHeight);

  const measuredLines = wrapMeasuredText(
    node.text,
    contentWidth,
    fontManager,
    fontName,
    node.style.fontSize,
  );

  const textHeight = measuredLines.length * lineHeightMm;
  const blockY = resolveBlockY(
    node.style.verticalAlign,
    paddingTop,
    contentHeight,
    textHeight,
  );

  const lines: TextLayoutLine[] = measuredLines.map((line, index) => ({
    text: line.text,
    x: resolveLineX(node.style.align, paddingLeft, contentWidth, line.width),
    y: blockY + index * lineHeightMm,
    width: line.width,
    ...(line.runs ? { runs: line.runs } : {}),
  }));

  return {
    lines,
    lineHeightMm,
    overflow:
      paddingLeft + paddingRight >= node.box.width ||
      paddingTop + paddingBottom >= node.box.height ||
      textHeight - contentHeight > TEXT_OVERFLOW_TOLERANCE_MM ||
      measuredLines.some(line => line.width - contentWidth > TEXT_OVERFLOW_TOLERANCE_MM),
  };
}

export function layoutTextNode(node: TextNode, fontManager: FontManager): TextNode {
  const requestedFontName = node.style.fontName || fontManager.getDefaultFontName();
  const face = resolveFontFace(fontManager, requestedFontName, node.style.fontWeight);
  const resolvedNode = {
    ...node,
    style: {
      ...node.style,
      fontName: face.name,
      syntheticBold: face.syntheticBold,
    },
  };
  return { ...resolvedNode, layout: createTextLayout(resolvedNode, fontManager) };
}
