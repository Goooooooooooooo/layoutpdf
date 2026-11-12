import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBlankTemplateFile } from '@/engine/core/document.js';
import type { RenderBuildContext } from '@/engine/core/plugin.js';
import { createPluginRegistry } from '@/engine/core/pluginRegistry.js';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import { layoutRenderTree } from '@/engine/renderTree/layout.js';
import { resolveRenderTree } from '@/engine/renderTree/resolve.js';
import { checkboxPlugin } from '@/plugins/checkbox/checkbox.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: (_name, text, size) => text.length * size * 0.5,
  ensureBrowserFont: async () => 'default',
};

const format = defaultFormatSettingsForLocale('ja-JP');

const context: RenderBuildContext = {
  pageId: 'page_1',
  pageSize: { width: 210, height: 297 },
  input: {},
  fontManager,
  format,
  createNodeId: localId => `el_checkbox:node:${localId}`,
  report: () => {},
};

describe('checkboxPlugin', () => {
  it('registers a valid boolean input with stable defaults', () => {
    const registry = createPluginRegistry([checkboxPlugin]);
    const element = checkboxPlugin.createDefaultElement({
      id: 'el_checkbox',
      position: { x: 10, y: 20 },
    });

    assert.equal(registry.validateElement(element).length, 0);
    assert.equal(element.value, false);
    assert.equal(element.binding?.key, 'field_el_checkbox');
    assert.deepEqual(element.box, { x: 10, y: 20, width: 8, height: 8 });
  });

  it('builds one shared rectangle and one checkbox text node without mutation', () => {
    const element = checkboxPlugin.createDefaultElement({
      id: 'el_checkbox',
      position: { x: 0, y: 0 },
    });
    const before = structuredClone(element);
    const nodes = checkboxPlugin.buildRenderNodes({ element, value: true, context });

    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].kind, 'rect');
    assert.equal(nodes[0].id, 'el_checkbox:node:box');
    assert.equal(nodes[1].kind === 'text' && nodes[1].text, '✓');
    assert.equal(nodes[1].input?.kind, 'checkbox');
    assert.equal(nodes[1].input?.value, true);
    assert.deepEqual(element, before);
  });

  it('keeps an unchecked value visible as an empty box and rejects non-booleans', () => {
    const element = checkboxPlugin.createDefaultElement({
      id: 'el_checkbox',
      position: { x: 0, y: 0 },
    });
    const nodes = checkboxPlugin.buildRenderNodes({ element, value: false, context });

    assert.equal(nodes[0].kind === 'rect' && nodes[0].fill, '#ffffff');
    assert.equal(nodes[1].kind === 'text' && nodes[1].text, '');
    assert.equal(checkboxPlugin.valueSchema.safeParse('true').success, false);
    assert.equal(checkboxPlugin.valueSchema.safeParse(null).success, false);
  });

  it('resolves and lays out through the shared RenderTree pipeline', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    const element = checkboxPlugin.createDefaultElement({
      id: 'el_checkbox',
      position: { x: 10, y: 10 },
    });
    file.template.pages[0].elements.push(element);
    const registry = createPluginRegistry([checkboxPlugin]);
    const resolved = resolveRenderTree({
      file,
      input: { field_el_checkbox: true },
      plugins: registry,
      fontManager,
    });
    const document = layoutRenderTree(resolved, { fontManager });

    assert.equal(document.issues.some(issue => issue.severity === 'error'), false);
    assert.deepEqual(document.pages[0].nodes.map(node => node.kind), ['rect', 'text']);
    assert.equal(document.pages[0].nodes[1].kind === 'text'
      && document.pages[0].nodes[1].layout.lines[0]?.text, '✓');
  });
});
