import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RenderBuildContext } from '@/engine/core/plugin.js';
import { createPluginRegistry } from '@/engine/core/pluginRegistry.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';
import { barcodePlugin } from '@/plugins/barcode/barcode.js';

const context: RenderBuildContext = {
  pageId: 'page_1',
  pageSize: { width: 210, height: 297 },
  input: {},
  fontManager: {
    getDefaultFontName: () => 'default',
    getFontBytes: () => new Uint8Array(),
    assertTextSupported: () => undefined,
    measureText: () => 0,
    ensureBrowserFont: async () => 'default',
  },
  format: defaultFormatSettingsForLocale('en-US'),
  createNodeId: localId => `barcode:${localId}`,
  report: () => undefined,
};

function decodePng(dataUrl: string): Uint8Array {
  return new Uint8Array(Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

describe('barcodePlugin', () => {
  it('generates deterministic Code 128B PNG plus optional readable text', () => {
    const registry = createPluginRegistry([barcodePlugin]);
    const element = barcodePlugin.createDefaultElement({ id: 'barcode', position: { x: 10, y: 20 } });
    const nodes = barcodePlugin.buildRenderNodes({ element, value: 'ORDER-1001', context });
    const imageNode = nodes[0];

    assert.equal(registry.validateElement(element).length, 0);
    assert.deepEqual(nodes.map(node => node.kind), ['image', 'text']);
    assert.equal(imageNode.input?.value, 'ORDER-1001');
    const bytes = decodePng(imageNode.kind === 'image' ? imageNode.dataUrl! : '');
    assert.ok(bytes.length > 100);
    assert.equal(nodes[1].kind === 'text' && nodes[1].text, 'ORDER-1001');
  });

  it('enforces printable ASCII and can hide readable text', () => {
    assert.equal(barcodePlugin.valueSchema.safeParse('ABC 123').success, true);
    assert.equal(barcodePlugin.valueSchema.safeParse('日本語').success, false);
    assert.equal(barcodePlugin.valueSchema.safeParse('x'.repeat(81)).success, false);

    const element = barcodePlugin.createDefaultElement({ id: 'barcode', position: { x: 0, y: 0 } });
    element.props.showText = false;
    const nodes = barcodePlugin.buildRenderNodes({ element, value: 'ABC123', context });
    assert.deepEqual(nodes.map(node => node.kind), ['image']);
  });
});
