import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  configureNodeFontSubsetting,
  createDefaultNodeFontManager,
  createNodeEngine,
  createNodeFontManager,
  resolveBundledNodeFontPath,
} from '@/pdf-node.js';

const REGULAR = 'public/fonts/NotoSansCJKjp-Regular.otf';
const BOLD = 'public/fonts/NotoSansCJKjp-Bold.otf';
const WASM = 'public/fonts/hb-subset.wasm';

function pdfMagic(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.slice(0, 5));
}

describe('Node PDF entry', () => {
  it('builds a font manager from byte arrays', async () => {
    const bytes = new Uint8Array(await readFile(REGULAR));
    const manager = await createNodeFontManager([
      { name: 'Node Noto', bytes, fallback: true },
    ]);

    assert.equal(manager.getDefaultFontName(), 'Node Noto');
    assert.equal(manager.measureText('Node Noto', 'Hello', 12) > 0, true);
  });

  it('builds a regular/bold font pair from file paths', async () => {
    const manager = await createDefaultNodeFontManager({
      regularPath: REGULAR,
      boldPath: BOLD,
      family: 'Node Noto',
    });

    assert.equal(manager.getDefaultFontName(), 'Node Noto Regular');
    assert.deepEqual(manager.resolveFontFace?.('Node Noto Regular', 'bold'), {
      name: 'Node Noto Bold',
      syntheticBold: false,
    });
  });

  it('finds the bundled subsetter wasm', async () => {
    assert.equal(await configureNodeFontSubsetting({ wasmPath: WASM }), true);
  });

  it('finds the bundled fonts for zero-config use', () => {
    assert.equal(resolveBundledNodeFontPath()?.endsWith('NotoSansCJKjp-Regular.otf'), true);
    assert.equal(
      resolveBundledNodeFontPath('NotoSansCJKjp-Bold.otf')?.endsWith('NotoSansCJKjp-Bold.otf'),
      true,
    );
  });

  it('renders a subsetted CJK PDF without browser APIs', async () => {
    const engine = await createNodeEngine({
      fontSubsetting: { wasmPath: WASM },
    });

    const template = engine
      .createTemplate({ name: 'Node PDF' })
      .addElement('text', {
        x: 10,
        y: 10,
        value: '請求書',
        binding: { key: 'message' },
      })
      .build();

    const bytes = await engine
      .createDocument(template, { message: 'こんにちは世界' })
      .generatePdf({ subsetter: true });

    assert.equal(pdfMagic(bytes), '%PDF-');
    assert.ok(bytes.length > 1000, `expected a real PDF, got ${bytes.length} bytes`);
  });
});
