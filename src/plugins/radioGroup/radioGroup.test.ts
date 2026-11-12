import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RenderBuildContext } from '@/engine/core/plugin.js';
import { createPluginRegistry } from '@/engine/core/pluginRegistry.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';
import { radioGroupPlugin } from '@/plugins/radioGroup/radioGroup.js';

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
  createNodeId: localId => `radio:${localId}`,
  report: () => undefined,
};

describe('radioGroupPlugin', () => {
  it('builds standard marker and text nodes with one shared radio input', () => {
    const registry = createPluginRegistry([radioGroupPlugin]);
    const element = radioGroupPlugin.createDefaultElement({ id: 'radio', position: { x: 10, y: 20 } });
    const before = structuredClone(element);
    const nodes = radioGroupPlugin.buildRenderNodes({ element, value: 'option_2', context });

    assert.equal(registry.validateElement(element).length, 0);
    assert.deepEqual(nodes.map(node => node.kind), ['ellipse', 'text', 'ellipse', 'text']);
    assert.equal(nodes.filter(node => node.input).length, 2);
    assert.equal(nodes.find(node => node.input)?.input?.kind, 'radio');
    assert.deepEqual(nodes.find(node => node.input)?.input?.options, element.props.options);
    assert.equal(nodes[0].kind === 'ellipse' && nodes[0].fill, '#ffffff');
    assert.equal(nodes[2].kind === 'ellipse' && nodes[2].fill, element.props.markerColor);
    assert.deepEqual(element, before);
  });

  it('supports vertical square markers without changing the value contract', () => {
    const element = radioGroupPlugin.createDefaultElement({ id: 'radio', position: { x: 0, y: 0 } });
    element.props.direction = 'vertical';
    element.props.markerShape = 'square';
    const nodes = radioGroupPlugin.buildRenderNodes({ element, value: 'option_1', context });

    assert.deepEqual(nodes.map(node => node.kind), ['rect', 'text', 'rect', 'text']);
    assert.ok(nodes[2].box.y > nodes[0].box.y);
    assert.equal(radioGroupPlugin.valueSchema.safeParse(false).success, false);
  });
});
