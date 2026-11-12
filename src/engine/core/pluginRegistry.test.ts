import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import type { TemplateElement } from './document.js';
import type { FontManager } from '../pdf/font/fontManager.js';
import type { LayoutPDFPlugin, RenderBuildContext } from './plugin.js';
import { createPluginRegistry } from './pluginRegistry.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';

const propsSchema = z.object({ fontSize: z.number().positive() });
type TextProps = z.infer<typeof propsSchema>;

function createTextPlugin(overrides: Partial<LayoutPDFPlugin<TextProps, string>> = {}): LayoutPDFPlugin<TextProps, string> {
  return {
    metadata: { type: 'text', label: 'Text', category: 'data' },
    propsSchema,
    valueSchema: z.string(),
    createDefaultElement({ id, position }) {
      return {
        id,
        type: 'text',
        name: 'Text',
        box: { ...position, width: 40, height: 10 },
        rotate: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        value: '',
        props: { fontSize: 12 },
      };
    },
    properties: [
      { path: 'value', label: 'Value', editor: 'text' },
      { path: 'props.fontSize', label: 'Font size', editor: 'number' },
    ],
    buildRenderNodes({ element, value }) {
      return [{
        kind: 'text',
        id: `node_${element.id}`,
        sourceElementId: element.id,
        box: element.box,
        rotate: element.rotate,
        opacity: element.opacity,
        clip: true,
        zIndex: 0,
        text: value,
        style: {
          fontSize: element.props.fontSize,
          color: '#000000',
          fontWeight: 'normal',
          align: 'left',
          verticalAlign: 'middle',
          lineHeight: 1.2,
          padding: [0, 0, 0, 0],
        },
        layout: { lines: [], lineHeightMm: 0, overflow: false },
      }];
    },
    ...overrides,
  };
}

function element(type = 'text'): TemplateElement {
  return {
    id: 'el_1',
    type,
    name: 'Text',
    box: { x: 0, y: 0, width: 40, height: 10 },
    rotate: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    value: 'value',
    props: { fontSize: 12 },
  };
}

const unusedFontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: () => 0,
  ensureBrowserFont: async () => 'default',
};

const buildContext: RenderBuildContext = {
  pageId: 'page_1',
  pageSize: { width: 210, height: 297 },
  input: {},
  fontManager: unusedFontManager,
  format: defaultFormatSettingsForLocale('ja-JP'),
  createNodeId: localId => `el_1:${localId ?? 'node'}`,
  report: () => {},
};

describe('createPluginRegistry', () => {
  it('registers, lists, resolves, and builds plain-object plugins', () => {
    const plugin = createTextPlugin();
    const registry = createPluginRegistry([plugin]);

    assert.equal(registry.get('text'), plugin);
    assert.equal(registry.require('text'), plugin);
    assert.deepEqual(registry.list(), [plugin]);
    assert.equal(plugin.buildRenderNodes({ element: element() as TemplateElement<TextProps, string>, value: 'Hello', context: buildContext })[0].kind, 'text');
  });

  it('rejects duplicate plugin types', () => {
    assert.throws(
      () => createPluginRegistry([createTextPlugin(), createTextPlugin()]),
      /Duplicate plugin type: text/,
    );
  });

  it('rejects invalid default props', () => {
    const plugin = createTextPlugin({
      createDefaultElement(args) {
        return { ...createTextPlugin().createDefaultElement(args), props: { fontSize: 0 } };
      },
    });
    assert.throws(() => createPluginRegistry([plugin]), /invalid default props/);
  });

  it('rejects property paths outside the public element model', () => {
    const plugin = createTextPlugin({
      properties: [{ path: 'internal.secret', label: 'Secret', editor: 'text' }],
    });
    assert.throws(() => createPluginRegistry([plugin]), /invalid property path/);
  });

  it('returns structured issues for unknown and invalid plugin data', () => {
    const registry = createPluginRegistry([createTextPlugin()]);
    assert.equal(registry.validateElement(element('missing'))[0].code, 'UNKNOWN_PLUGIN');

    const invalid = element();
    invalid.props = { fontSize: 0 };
    invalid.value = 42;
    const issues = registry.validateElement(invalid);
    assert.ok(issues.some(issue => issue.code === 'INVALID_PLUGIN_PROPS'));
    assert.ok(issues.some(issue => issue.code === 'INVALID_PLUGIN_VALUE'));
  });
});
