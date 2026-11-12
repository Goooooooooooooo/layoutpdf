import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBlankTemplateFile } from '@/engine/core/document.js';
import type { RenderBuildContext } from '@/engine/core/plugin.js';
import { createPluginRegistry } from '@/engine/core/pluginRegistry.js';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import { layoutRenderTree } from '@/engine/renderTree/layout.js';
import { resolveRenderTree } from '@/engine/renderTree/resolve.js';
import { ellipsePlugin } from '@/plugins/ellipse/ellipse.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: () => 0,
  ensureBrowserFont: async () => 'default',
};

const format = defaultFormatSettingsForLocale('ja-JP');

const context: RenderBuildContext = {
  pageId: 'page_1',
  pageSize: { width: 210, height: 297 },
  input: {},
  fontManager,
  format,
  createNodeId: localId => `el_ellipse:node:${localId}`,
  report: () => {},
};

describe('ellipsePlugin', () => {
  it('registers with a visible non-square default element', () => {
    const registry = createPluginRegistry([ellipsePlugin]);
    const element = ellipsePlugin.createDefaultElement({
      id: 'el_ellipse',
      position: { x: 10, y: 20 },
    });

    assert.equal(registry.validateElement(element).length, 0);
    assert.deepEqual(element.box, { x: 10, y: 20, width: 40, height: 20 });
    assert.equal(element.value, null);
  });

  it('builds a deterministic ellipse node without mutating the element', () => {
    const element = ellipsePlugin.createDefaultElement({
      id: 'el_ellipse',
      position: { x: 3, y: 4 },
    });
    element.rotate = 15;
    element.opacity = 0.6;
    const before = structuredClone(element);
    const node = ellipsePlugin.buildRenderNodes({ element, value: null, context })[0];

    assert.equal(node.kind, 'ellipse');
    assert.equal(node.id, 'el_ellipse:node:ellipse');
    assert.deepEqual(node.box, element.box);
    assert.equal(node.rotate, 15);
    assert.equal(node.opacity, 0.6);
    assert.deepEqual(element, before);
  });

  it('accepts transparent fill and rejects invalid border data', () => {
    assert.equal(ellipsePlugin.propsSchema.safeParse({
      fill: null,
      border: { width: 1, color: '#000000', style: 'dotted' },
    }).success, true);
    assert.equal(ellipsePlugin.propsSchema.safeParse({
      fill: '#ffffff',
      border: { width: -1, color: '#000000', style: 'solid' },
    }).success, false);
    assert.equal(ellipsePlugin.valueSchema.safeParse({}).success, false);
  });

  it('passes through resolve and layout without backend-specific data', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    file.template.pages[0].elements.push(ellipsePlugin.createDefaultElement({
      id: 'el_ellipse',
      position: { x: 10, y: 10 },
    }));
    const resolved = resolveRenderTree({
      file,
      input: {},
      plugins: createPluginRegistry([ellipsePlugin]),
      fontManager,
    });
    const document = layoutRenderTree(resolved, { fontManager });

    assert.equal(document.issues.some(issue => issue.severity === 'error'), false);
    assert.equal(document.pages[0].nodes[0].kind, 'ellipse');
  });
});
