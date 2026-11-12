import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { initWithBytes, subsetFontBytes } from './subsetFont.js';
import { inspectCffCharset } from './cffCharset.js';
import { collectUsedCodePoints } from './collectUsedCodePoints.js';
import { fontkit } from './fontkitRuntime.js';
import type { RenderDocument, TextNode, TableNode, TableColumn, TableValueRow, ComputedTableFooter } from '../../renderTree/model.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';

const format = defaultFormatSettingsForLocale('ja-JP');

let wasmReady = false;

async function ensureWasm(): Promise<void> {
  if (wasmReady) return;
  const bytes = new Uint8Array(await readFile('public/fonts/hb-subset.wasm'));
  await initWithBytes(bytes);
  wasmReady = true;
}

function textNode(text: string): TextNode {
  return {
    kind: 'text',
    id: 'n:text',
    sourceElementId: 'e',
    box: { x: 0, y: 0, width: 100, height: 20 },
    rotate: 0, opacity: 1, clip: false, zIndex: 0,
    text,
    style: {
      fontSize: 12, color: '#000', fontWeight: 'normal',
      align: 'left', verticalAlign: 'top', lineHeight: 1.2,
      padding: [0, 0, 0, 0],
    },
    layout: { lines: [{ text, x: 0, y: 0, width: 50 }], lineHeightMm: 5, overflow: false },
  };
}

function tableNode(columns: TableColumn[], rows: TableValueRow[], footers: ComputedTableFooter[]): TableNode {
  return {
    kind: 'table',
    id: 'n:table', sourceElementId: 'e',
    box: { x: 0, y: 0, width: 100, height: 100 },
    rotate: 0, opacity: 1, clip: false, zIndex: 0,
    columns,
    rows,
    computedRows: rows,
    footers: [],
    computedFooters: footers,
    layout: { cells: [], lines: [], height: 100 },
    style: { headerHeight: 10, rowHeight: 8, fontSize: 10, border: { width: 0.5, color: '#000', style: 'solid' }, headerBackground: '#eee', headerColor: '#000', bodyColor: '#000' },
  };
}

describe('subset glyph coverage', () => {
  it('subset font contains all CJK glyphs used in document', async () => {
    await ensureWasm();
    const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));

    const doc: RenderDocument = {
      templateId: 't', format, issues: [],
      pages: [{
        id: 'p1', sourcePageId: 'p1', continuationIndex: 0,
        size: { width: 210, height: 297 }, padding: [0, 0, 0, 0],
        background: { kind: 'blank' },
        nodes: [
          textNode('請求書 金額 合計'),
          textNode('株式会社テスト 請求先'),
          tableNode(
            [{ id: 'c1', label: '品名', key: 'item', width: 60, valueType: 'text', align: 'left' }],
            [{ id: 'r1', item: 'A4用紙' }],
            [{ id: 'f1', label: '小計', value: 3000, bold: true }],
          ),
        ],
      }],
    };

    const codepoints = collectUsedCodePoints(doc);
    const subsetBytes = await subsetFontBytes(fontBytes, codepoints);

    const subsetFont = fontkit.create(subsetBytes);

    const missingGlyphs: string[] = [];
    for (const cp of codepoints) {
      if (cp <= 0x1f || cp === 0x7f) continue;
      const glyph = subsetFont.glyphForCodePoint(cp);
      if (!glyph || glyph.id === 0) {
        missingGlyphs.push(`U+${cp.toString(16).toUpperCase()} (${String.fromCodePoint(cp)})`);
      }
    }

    assert.equal(
      missingGlyphs.length,
      0,
      `Subset font missing ${missingGlyphs.length} glyphs: ${missingGlyphs.slice(0, 20).join(', ')}${missingGlyphs.length > 20 ? '...' : ''}`,
    );
  });

  it('subset font covers common Japanese invoice terms', async () => {
    await ensureWasm();
    const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));

    const commonTerms = [
      '請求書', '金額', '合計', '小計', '税込', '税抜',
      '品名', '数量', '単価', '摘要', '備考',
      'お支払期日', '振込先', '口座番号',
      '発行日', '請求日', '納品日',
      '株式会社', '有限会社', '代表取締役',
    ];

    const codepoints = new Set<number>();
    for (const term of commonTerms) {
      for (const char of term) {
        codepoints.add(char.codePointAt(0)!);
      }
    }

    const subsetBytes = await subsetFontBytes(fontBytes, codepoints);
    const subsetFont = fontkit.create(subsetBytes);

    const missingGlyphs: string[] = [];
    for (const term of commonTerms) {
      for (const char of term) {
        const cp = char.codePointAt(0)!;
        const glyph = subsetFont.glyphForCodePoint(cp);
        if (!glyph || glyph.id === 0) {
          missingGlyphs.push(`${char} (U+${cp.toString(16).toUpperCase()})`);
        }
      }
    }

    assert.equal(
      missingGlyphs.length,
      0,
      `Subset font missing glyphs for common terms: ${missingGlyphs.slice(0, 10).join(', ')}`,
    );
  });

  it('subset font is smaller than original', async () => {
    await ensureWasm();
    const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));

    const codepoints = collectUsedCodePoints({
      templateId: 't', format, issues: [],
      pages: [{
        id: 'p1', sourcePageId: 'p1', continuationIndex: 0,
        size: { width: 210, height: 297 }, padding: [0, 0, 0, 0],
        background: { kind: 'blank' },
        nodes: [textNode('テスト 請求書 金額')],
      }],
    });

    const subsetBytes = await subsetFontBytes(fontBytes, codepoints);

    assert.ok(
      subsetBytes.length < fontBytes.length,
      `Subset (${subsetBytes.length}) should be smaller than original (${fontBytes.length})`,
    );

    const ratio = subsetBytes.length / fontBytes.length;
    assert.ok(
      ratio < 0.1,
      `Subset should be less than 10% of original, got ${(ratio * 100).toFixed(1)}%`,
    );
  });

  it('keeps CID-keyed CFF charset identity and original glyph ids', async () => {
    await ensureWasm();
    const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));
    const sourceFont = fontkit.create(fontBytes);

    const doc: RenderDocument = {
      templateId: 't',
      format,
      issues: [],
      pages: [
        {
          id: 'p1',
          sourcePageId: 'p1',
          continuationIndex: 0,
          size: { width: 210, height: 297 },
          padding: [0, 0, 0, 0],
          background: { kind: 'blank' },
          nodes: [
            textNode('請求書 金額 合計 ¥12,345'),
            tableNode(
              [{ id: 'c1', label: '品名', key: 'item', width: 60, valueType: 'text', align: 'left' }],
              [{ id: 'r1', item: 'A4用紙' }],
              [{ id: 'f1', label: '小計', value: 3000, bold: true }],
            ),
          ],
        },
      ],
    };

    const codepoints = collectUsedCodePoints(doc);
    const subsetBytes = await subsetFontBytes(fontBytes, codepoints);
    const charset = inspectCffCharset(subsetBytes);

    assert.equal(charset.hasCff, true);
    assert.equal(charset.isCidKeyed, true, 'Noto CJK subsets stay CID-keyed');
    assert.equal(
      charset.cidEqualsGid,
      true,
      'PDF writes CID = glyph id, so the subset charset must stay identity',
    );

    const subsetFont = fontkit.create(subsetBytes);
    const drifted: string[] = [];
    for (const cp of codepoints) {
      if (cp <= 0x1f || cp === 0x7f) continue;
      const sourceGid = sourceFont.glyphForCodePoint(cp).id;
      const subsetGid = subsetFont.glyphForCodePoint(cp).id;
      const cid = charset.cidForGid(subsetGid);
      if (subsetGid !== sourceGid || cid !== subsetGid) {
        drifted.push(
          `U+${cp.toString(16).toUpperCase()} source=${sourceGid} subset=${subsetGid} cid=${cid}`,
        );
      }
    }
    assert.deepEqual(
      drifted,
      [],
      `Glyph ids must be retained: ${drifted.slice(0, 10).join(', ')}`,
    );
  });
});
