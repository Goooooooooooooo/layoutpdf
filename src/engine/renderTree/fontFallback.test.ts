import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import type { TableNode, TextNode } from '@/engine/renderTree/model.js';
import { createTextLayout, wrapMeasuredText } from '@/engine/renderTree/textLayout.js';
import { tablePlugin } from '@/plugins/table/table.js';
import { computeTableNode } from '@/engine/renderTree/tableLayout.js';
import { layoutTablePresentation } from '@/engine/renderTree/tablePresentation.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';
import { pdfPtToMm } from '@/engine/utils/units.js';

const LATIN = 'Latin';
const FULL = 'Full';
const ASCII = /^[\x20-\x7e]$/u;

// The Latin face covers ASCII only; the full face covers everything else.
const fontManager: FontManager = {
  getDefaultFontName: () => LATIN,
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: (_name, text, size) => Array.from(text).length * size * 0.5,
  ensureBrowserFont: async () => LATIN,
  getFallbackChain: name => (name === LATIN ? [LATIN, FULL] : [name]),
  resolveTextRuns: (name, text) => {
    const runs: Array<{ text: string; fontName: string }> = [];
    for (const char of Array.from(text)) {
      const fontName = ASCII.test(char) ? name : FULL;
      const last = runs[runs.length - 1];
      if (last?.fontName === fontName) last.text += char;
      else runs.push({ text: char, fontName });
    }
    return runs;
  },
};

function textNode(text: string): TextNode {
  return {
    kind: 'text',
    id: 'el_1:node:text',
    sourceElementId: 'el_1',
    box: { x: 0, y: 0, width: 200, height: 40 },
    rotate: 0,
    opacity: 1,
    clip: true,
    zIndex: 0,
    text,
    style: {
      fontName: LATIN,
      fontSize: 10,
      color: '#000000',
      fontWeight: 'normal',
      align: 'left',
      verticalAlign: 'top',
      lineHeight: 1.2,
      padding: [0, 0, 0, 0],
    },
    layout: { lines: [], lineHeightMm: 0, overflow: false },
  };
}

describe('font fallback runs', () => {
  it('splits a text line into runs without changing the text', () => {
    const layout = createTextLayout(textNode('Invoice 請求書'), fontManager);
    const line = layout.lines[0];

    assert.equal(line.text, 'Invoice 請求書');
    assert.deepEqual(line.runs, [
      { text: 'Invoice ', fontName: LATIN },
      { text: '請求書', fontName: FULL },
    ]);
    assert.equal(
      line.runs!.map(run => run.text).join(''),
      line.text,
    );
    assert.equal(
      line.width,
      pdfPtToMm(fontManager.measureText(LATIN, line.text, 10)),
    );
  });

  it('omits runs when the requested face covers the whole line', () => {
    const layout = createTextLayout(textNode('Invoice'), fontManager);

    assert.equal(layout.lines[0].runs, undefined);
  });

  it('attaches runs to each measured line when text wraps', () => {
    // The Latin word and the CJK word each occupy their own line, and every
    // line keeps the face that covers it.
    const lines = wrapMeasuredText('Invoice 請求書', 13, fontManager, LATIN, 10);

    assert.deepEqual(lines.map(line => line.text), ['Invoice', '請求書']);
    // The primary face covers the first line, so no run data is stored.
    assert.equal(lines[0].runs, undefined);
    assert.deepEqual(lines[1].runs, [{ text: '請求書', fontName: FULL }]);
  });

  it('uses the fallback face for single-line table headers and body text', () => {
    const format = defaultFormatSettingsForLocale('ja-JP');
    const element = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
    const node = computeTableNode(tablePlugin.buildRenderNodes({
      element,
      value: [{ id: 'row_1', item: 'Invoice 請求書', quantity: 1, unitPrice: 100 }],
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager,
        format,
        createNodeId: localId => `el_table:node:${localId}`,
        report: () => {},
      },
    })[0] as TableNode);

    const output = layoutTablePresentation(node, fontManager, format);
    const header = output.layout.cells.find(cell => cell.role === 'header')!;
    const body = output.layout.cells.find(cell => cell.role === 'body')!;

    assert.deepEqual(header.textRuns?.map(run => run.fontName), [FULL]);
    assert.deepEqual(body.lines?.[0]?.runs?.map(run => run.fontName), [LATIN, FULL]);
  });
});
