import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FontManager } from '../pdf/font/fontManager.js';
import { pdfPtToMm } from '../utils/units.js';
import type { TextNode } from './model.js';
import { createTextLayout, layoutTextNode } from './textLayout.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'TestFont',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: (_fontName, text, sizePt) => Array.from(text).length * sizePt * 0.5,
  ensureBrowserFont: async () => 'TestFont',
};

function textNode(overrides: Partial<TextNode> = {}): TextNode {
  return {
    kind: 'text',
    id: 'el_1:node:text',
    sourceElementId: 'el_1',
    box: { x: 10, y: 10, width: 20, height: 20 },
    rotate: 0,
    opacity: 1,
    clip: true,
    zIndex: 0,
    text: 'ABCD',
    style: {
      fontSize: 10,
      color: '#000000',
      fontWeight: 'normal',
      align: 'left',
      verticalAlign: 'top',
      lineHeight: 1.2,
      padding: [1, 1, 1, 1],
    },
    layout: { lines: [], lineHeightMm: 0, overflow: false },
    ...overrides,
  };
}

describe('createTextLayout', () => {
  it('uses shared font metrics and point-to-mm line height', () => {
    const layout = createTextLayout(textNode(), fontManager);
    assert.equal(layout.lines.length, 1);
    assert.equal(layout.lines[0].text, 'ABCD');
    assert.ok(Math.abs(layout.lines[0].width - pdfPtToMm(20)) < 1e-10);
    assert.ok(Math.abs(layout.lineHeightMm - pdfPtToMm(12)) < 1e-10);
  });

  it('wraps text by measured character width', () => {
    const node = textNode({ box: { x: 0, y: 0, width: 7, height: 30 }, text: 'ABCDE' });
    const layout = createTextLayout(node, fontManager);
    assert.deepEqual(layout.lines.map(line => line.text), ['AB', 'CD', 'E']);
  });

  it('preserves explicit line breaks including empty lines', () => {
    const layout = createTextLayout(textNode({ text: 'A\n\nB' }), fontManager);
    assert.deepEqual(layout.lines.map(line => line.text), ['A', '', 'B']);
  });

  it('calculates horizontal and vertical alignment once', () => {
    const node = textNode({
      text: 'AB',
      style: {
        ...textNode().style,
        align: 'right',
        verticalAlign: 'bottom',
      },
    });
    const layout = createTextLayout(node, fontManager);
    const expectedWidth = pdfPtToMm(10);
    assert.ok(Math.abs(layout.lines[0].x - (19 - expectedWidth)) < 1e-10);
    assert.ok(layout.lines[0].y > 1);
  });

  it('reports vertical, horizontal, and padding overflow', () => {
    assert.equal(createTextLayout(textNode({ box: { x: 0, y: 0, width: 5, height: 2 } }), fontManager).overflow, true);
    assert.equal(createTextLayout(textNode({ box: { x: 0, y: 0, width: 1, height: 20 }, text: 'A' }), fontManager).overflow, true);
    assert.equal(createTextLayout(textNode({ style: { ...textNode().style, padding: [10, 10, 10, 10] } }), fontManager).overflow, true);
  });

  it('ignores sub-visual metric rounding but still reports meaningful clipping', () => {
    const lineHeight = pdfPtToMm(textNode().style.fontSize * textNode().style.lineHeight);
    const nearlyExact = textNode({
      box: { x: 0, y: 0, width: 20, height: lineHeight + 2 - 0.01 },
      text: 'A',
    });
    const clipped = textNode({
      box: { x: 0, y: 0, width: 20, height: lineHeight + 2 - 0.06 },
      text: 'A',
    });

    assert.equal(createTextLayout(nearlyExact, fontManager).overflow, false);
    assert.equal(createTextLayout(clipped, fontManager).overflow, true);
  });

  it('returns a new node without mutating the unresolved node', () => {
    const node = textNode();
    const result = layoutTextNode(node, fontManager);
    assert.notEqual(result, node);
    assert.deepEqual(node.layout.lines, []);
    assert.equal(result.layout.lines.length, 1);
  });

  it('measures and publishes a real bold face when the font family provides one', () => {
    const measuredNames: string[] = [];
    const manager: FontManager = {
      ...fontManager,
      resolveFontFace: (_name, weight) => ({
        name: weight === 'bold' ? 'TestFontBold' : 'TestFont',
        syntheticBold: false,
      }),
      measureText: (name, text, sizePt) => {
        measuredNames.push(name);
        return Array.from(text).length * sizePt * 0.5;
      },
    };
    const result = layoutTextNode(textNode({
      style: { ...textNode().style, fontWeight: 'bold' },
    }), manager);

    assert.equal(result.style.fontName, 'TestFontBold');
    assert.equal(result.style.syntheticBold, false);
    assert.deepEqual(new Set(measuredNames), new Set(['TestFontBold']));
  });
});
