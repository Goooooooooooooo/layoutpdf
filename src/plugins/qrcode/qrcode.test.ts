import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RenderBuildContext } from '@/engine/core/plugin.js';
import { createPluginRegistry } from '@/engine/core/pluginRegistry.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';
import { qrcodePlugin } from '@/plugins/qrcode/qrcode.js';

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
  format: defaultFormatSettingsForLocale('zh-CN'),
  createNodeId: localId => `qr:${localId}`,
  report: () => undefined,
};

function decodePng(dataUrl: string): Uint8Array {
  const encoded = dataUrl.replace(/^data:image\/png;base64,/, '');
  return new Uint8Array(Buffer.from(encoded, 'base64'));
}

describe('qrcodePlugin', () => {
  it('generates deterministic PNG nodes without backend imports', () => {
    const registry = createPluginRegistry([qrcodePlugin]);
    const element = qrcodePlugin.createDefaultElement({ id: 'qr', position: { x: 10, y: 20 } });
    const first = qrcodePlugin.buildRenderNodes({ element, value: 'https://example.test/1001', context })[0];
    const second = qrcodePlugin.buildRenderNodes({ element, value: 'https://example.test/1001', context })[0];

    assert.equal(registry.validateElement(element).length, 0);
    assert.equal(first.kind, 'image');
    assert.equal(first.input?.kind, 'text');
    assert.equal(first.kind === 'image' && first.dataUrl, second.kind === 'image' && second.dataUrl);
    const bytes = decodePng(first.kind === 'image' ? first.dataUrl! : '');
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(bytes.length > 100);
  });

  it('keeps empty optional values renderable and rejects oversized input', () => {
    const element = qrcodePlugin.createDefaultElement({ id: 'qr', position: { x: 0, y: 0 } });
    const node = qrcodePlugin.buildRenderNodes({ element, value: '', context })[0];
    assert.match(node.kind === 'image' ? node.dataUrl! : '', /^data:image\/png;base64,/);
    assert.equal(qrcodePlugin.valueSchema.safeParse('x'.repeat(2049)).success, false);
  });

  it('encodes CJK input without mutating the shared QR byte converter', () => {
    const element = qrcodePlugin.createDefaultElement({ id: 'qr', position: { x: 0, y: 0 } });
    const cjk = qrcodePlugin.buildRenderNodes({ element, value: '文档', context })[0];
    const ascii = qrcodePlugin.buildRenderNodes({ element, value: '?? ??', context })[0];
    assert.notEqual(
      cjk.kind === 'image' && cjk.dataUrl,
      ascii.kind === 'image' && ascii.dataUrl,
    );
  });
});
