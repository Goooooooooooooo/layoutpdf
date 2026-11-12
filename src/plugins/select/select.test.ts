import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RenderBuildContext } from '@/engine/core/plugin.js';
import { createPluginRegistry } from '@/engine/core/pluginRegistry.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';
import { selectPlugin } from '@/plugins/select/select.js';

function context(issues: Array<{ code: string }> = []): RenderBuildContext {
  return {
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
    createNodeId: localId => `select:${localId}`,
    report: issue => issues.push(issue),
  };
}

describe('selectPlugin', () => {
  it('registers a structured default and publishes choice input metadata', () => {
    const registry = createPluginRegistry([selectPlugin]);
    const element = selectPlugin.createDefaultElement({ id: 'select', position: { x: 10, y: 20 } });
    element.value = 'option_2';
    const before = structuredClone(element);
    const node = selectPlugin.buildRenderNodes({ element, value: element.value, context: context() })[0];

    assert.equal(registry.validateElement(element).length, 0);
    assert.equal(node.kind === 'text' && node.text, '选项二');
    assert.equal(node.input?.kind, 'select');
    assert.deepEqual(node.input?.options, element.props.options);
    assert.notEqual(node.input?.options, element.props.options);
    assert.deepEqual(element, before);
  });

  it('rejects duplicate option values and reports values outside the option set', () => {
    const element = selectPlugin.createDefaultElement({ id: 'select', position: { x: 0, y: 0 } });
    const invalidProps = {
      ...element.props,
      options: [
        { label: 'One', value: 'same' },
        { label: 'Two', value: 'same' },
      ],
    };
    assert.equal(selectPlugin.propsSchema.safeParse(invalidProps).success, false);

    const issues: Array<{ code: string }> = [];
    const node = selectPlugin.buildRenderNodes({
      element,
      value: 'removed',
      context: context(issues),
    })[0];
    assert.equal(node.kind === 'text' && node.text, 'removed');
    assert.deepEqual(issues.map(issue => issue.code), ['INVALID_CHOICE_VALUE']);
  });
});
