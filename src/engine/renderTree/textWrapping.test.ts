import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import { pdfPtToMm } from '@/engine/utils/units.js';
import type { TextNode } from '@/engine/renderTree/model.js';
import { createTextLayout } from '@/engine/renderTree/textLayout.js';
import { wrapMeasuredText } from '@/engine/renderTree/textLayout.js';

const FONT_SIZE = 10;
const CHAR_MM = pdfPtToMm(FONT_SIZE);
const FONT_NAME = 'TestFont';

// One code point measures exactly one character cell, so a width of
// `n * CHAR_MM` fits exactly n characters.
const fontManager: FontManager = {
  getDefaultFontName: () => FONT_NAME,
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: (_fontName, text, sizePt) => Array.from(text).length * sizePt,
  ensureBrowserFont: async () => FONT_NAME,
};

function wrap(text: string, charactersPerLine: number): string[] {
  return wrapMeasuredText(
    text,
    charactersPerLine * CHAR_MM + 1e-9,
    fontManager,
    FONT_NAME,
    FONT_SIZE,
  ).map(line => line.text);
}

function firstCharacter(text: string): string {
  return Array.from(text)[0] ?? '';
}

describe('line breaking', () => {
  it('keeps Latin words whole instead of splitting mid-word', () => {
    assert.deepEqual(wrap('alpha beta', 8), ['alpha', 'beta']);
  });

  it('drops the space at a line break instead of carrying it', () => {
    assert.deepEqual(wrap('aa bb', 2), ['aa', 'bb']);
  });

  it('splits a single word that cannot fit on any line', () => {
    assert.deepEqual(wrap('abcdefgh', 3), ['abc', 'def', 'gh']);
  });

  it('never starts a line with closing punctuation', () => {
    const lines = wrap('あいう。えお', 3);

    assert.deepEqual(lines, ['あい', 'う。え', 'お']);
    assert.ok(lines.every(line => firstCharacter(line) !== '。'));
  });

  it('never ends a line with opening punctuation', () => {
    const lines = wrap('あ（いうえ', 2);

    assert.deepEqual(lines, ['あ', '（い', 'うえ']);
    assert.ok(lines.every(line => !line.endsWith('（')));
  });

  it('keeps punctuation attached to the preceding Latin word', () => {
    assert.deepEqual(wrap('Hello, world', 6), ['Hello,', 'world']);
  });

  it('breaks after a hyphen rather than before it', () => {
    assert.deepEqual(wrap('well-known', 5), ['well-', 'known']);
  });

  it('keeps explicit blank lines', () => {
    assert.deepEqual(wrap('A\n \nB', 5), ['A', '', 'B']);
  });

  it('feeds the same line set to table measurement and text layout', () => {
    const text = 'alpha beta gamma';
    const width = 6 * CHAR_MM + 1e-9;
    const expected = wrapMeasuredText(
      text,
      width,
      fontManager,
      FONT_NAME,
      FONT_SIZE,
    ).map(line => line.text);

    const node: TextNode = {
      kind: 'text',
      id: 'el_1:node:text',
      sourceElementId: 'el_1',
      box: { x: 0, y: 0, width, height: 100 },
      rotate: 0,
      opacity: 1,
      clip: true,
      zIndex: 0,
      text,
      style: {
        fontName: FONT_NAME,
        fontSize: FONT_SIZE,
        color: '#000000',
        fontWeight: 'normal',
        align: 'left',
        verticalAlign: 'top',
        lineHeight: 1.2,
        padding: [0, 0, 0, 0],
      },
      layout: { lines: [], lineHeightMm: 0, overflow: false },
    };
    const layout = createTextLayout(node, fontManager);

    assert.deepEqual(layout.lines.map(line => line.text), expected);
    assert.deepEqual(expected, ['alpha', 'beta', 'gamma']);
  });
});
