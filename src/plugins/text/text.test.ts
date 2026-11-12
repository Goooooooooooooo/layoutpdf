import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FontManager } from '../../engine/pdf/font/fontManager.js';
import { createPluginRegistry } from '../../engine/core/pluginRegistry.js';
import { textPlugin } from './text.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: () => 0,
  ensureBrowserFont: async () => 'default',
};

const format = defaultFormatSettingsForLocale('ja-JP');

describe('textPlugin', () => {
  it('registers without adapters and creates a valid default element', () => {
    const registry = createPluginRegistry([textPlugin]);
    const element = registry.require('text').createDefaultElement({
      id: 'el_1',
      position: { x: 20, y: 30 },
    });

    assert.equal(element.id, 'el_1');
    assert.equal(element.type, 'text');
    assert.equal(element.binding?.key, 'field_el_1');
    assert.deepEqual(element.box, { x: 20, y: 30, width: 80, height: 12 });
  });

  it('builds a text node with resolved value and input metadata', () => {
    const element = textPlugin.createDefaultElement({ id: 'el_1', position: { x: 0, y: 0 } });
    const before = structuredClone(element);
    const nodes = textPlugin.buildRenderNodes({
      element,
      value: '入力値',
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager,
        format,
        createNodeId: localId => `el_1:node:${localId}`,
        report: () => {},
      },
    });

    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].kind, 'text');
    assert.equal(nodes[0].kind === 'text' ? nodes[0].text : '', '入力値');
    assert.equal(nodes[0].input?.key, 'field_el_1');
    assert.equal(nodes[0].input?.value, '入力値');
    assert.deepEqual(element, before);
  });

  it('contains no mode-specific property in its build contract or output', () => {
    const element = textPlugin.createDefaultElement({ id: 'el_1', position: { x: 0, y: 0 } });
    const node = textPlugin.buildRenderNodes({
      element,
      value: 'same value',
      context: {
        pageId: 'page_1',
        pageSize: { width: 210, height: 297 },
        input: {},
        fontManager,
        format,
        createNodeId: () => 'el_1:node:text',
        report: () => {},
      },
    })[0];
    assert.equal('mode' in node, false);
  });
});
