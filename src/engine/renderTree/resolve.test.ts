import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { createBlankTemplateFile, type TemplateElement } from '../core/document.js';
import type { FontManager } from '../pdf/font/fontManager.js';
import type { LayoutPDFPlugin } from '../core/plugin.js';
import { createPluginRegistry } from '../core/pluginRegistry.js';
import { imagePlugin } from '../../plugins/image/image.js';
import { resolveRenderTree } from './resolve.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: (_name, text, size) => text.length * size,
  ensureBrowserFont: async () => 'default',
};

const propsSchema = z.object({ fontSize: z.number().positive() });
type TextProps = z.infer<typeof propsSchema>;

function textPlugin(buildOverride?: LayoutPDFPlugin<TextProps, string>['buildRenderNodes']): LayoutPDFPlugin<TextProps, string> {
  return {
    metadata: { type: 'text', label: 'Text', category: 'data' },
    propsSchema,
    valueSchema: z.string(),
    createDefaultElement({ id, position }) {
      return textElement(id, '', position);
    },
    properties: [],
    buildRenderNodes: buildOverride ?? (({ element, value, context }) => [{
      kind: 'text',
      id: context.createNodeId('text'),
      sourceElementId: element.id,
      box: { ...element.box },
      rotate: element.rotate,
      opacity: element.opacity,
      clip: true,
      zIndex: -1,
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
    }]),
  };
}

function textElement(
  id: string,
  value = 'default',
  position = { x: 10, y: 10 },
): TemplateElement<TextProps, string> {
  return {
    id,
    type: 'text',
    name: 'Text',
    box: { ...position, width: 50, height: 10 },
    rotate: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    value,
    binding: { key: 'field' },
    props: { fontSize: 12 },
  };
}

function fixture() {
  const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
  file.template.pages[0].elements.push(textElement('el_1'));
  return file;
}

describe('resolveRenderTree', () => {
  it('resolves Template + Input + Plugin into deterministic nodes without mode', () => {
    const file = fixture();
    const registry = createPluginRegistry([textPlugin()]);

    const first = resolveRenderTree({ file, input: { field: 'Hello' }, plugins: registry, fontManager });
    const second = resolveRenderTree({ file, input: { field: 'Hello' }, plugins: registry, fontManager });

    assert.deepEqual(first, second);
    assert.equal(first.pages[0].nodes[0].id, 'el_1:node:text');
    assert.equal(first.pages[0].nodes[0].sourceElementId, 'el_1');
    assert.equal(first.pages[0].nodes[0].zIndex, 0);
    assert.equal(first.pages[0].nodes[0].kind, 'text');
    assert.equal(first.pages[0].nodes[0].kind === 'text' ? first.pages[0].nodes[0].text : '', 'Hello');
  });

  it('derives document format settings from template metadata language', () => {
    const file = fixture();
    file.template.metadata = { language: 'en-US' };
    const registry = createPluginRegistry([textPlugin(({ element, context }) => [{
      kind: 'text',
      id: context.createNodeId('locale'),
      sourceElementId: element.id,
      box: { ...element.box },
      rotate: element.rotate,
      opacity: element.opacity,
      clip: true,
      zIndex: -1,
      text: `${context.format.locale}:${context.format.currency}`,
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
    }])]);

    const document = resolveRenderTree({ file, input: {}, plugins: registry, fontManager });

    assert.equal(document.format.locale, 'en-US');
    assert.equal(document.format.currency, 'USD');
    const node = document.pages[0].nodes[0];
    assert.equal(node.kind === 'text' && node.text, 'en-US:USD');
  });

  it('falls back to the default document locale for unknown metadata language', () => {
    const file = fixture();
    file.template.metadata = { language: 'unknown-locale' };

    const document = resolveRenderTree({
      file,
      input: {},
      plugins: createPluginRegistry([textPlugin()]),
      fontManager,
    });

    assert.deepEqual(document.format, defaultFormatSettingsForLocale('ja-JP'));
  });

  it('preserves explicit empty input values', () => {
    const result = resolveRenderTree({
      file: fixture(),
      input: { field: '' },
      plugins: createPluginRegistry([textPlugin()]),
      fontManager,
    });
    const node = result.pages[0].nodes[0];
    assert.equal(node.kind === 'text' ? node.text : 'not-text', '');
  });

  it('reports required input errors only when no valid default or user provides empty', () => {
    const registry = createPluginRegistry([textPlugin()]);

    const file = fixture();
    file.template.pages[0].elements[0].binding = { key: 'field', required: true };

    const absent = resolveRenderTree({ file, input: {}, plugins: registry, fontManager });
    assert.equal(absent.issues.some(issue =>
      issue.code === 'MISSING_REQUIRED_INPUT' && issue.inputKey === 'field'
    ), false, 'element value "default" satisfies required');
    assert.equal(absent.pages[0].nodes[0].kind === 'text' && absent.pages[0].nodes[0].text, 'default');

    const blank = resolveRenderTree({ file, input: { field: ' ' }, plugins: registry, fontManager });
    assert.ok(blank.issues.some(issue => issue.code === 'MISSING_REQUIRED_INPUT'));

    const valid = resolveRenderTree({ file, input: { field: 'value' }, plugins: registry, fontManager });
    assert.equal(valid.issues.some(issue => issue.code === 'MISSING_REQUIRED_INPUT'), false);

    const emptyValue = fixture();
    emptyValue.template.pages[0].elements[0].value = '';
    emptyValue.template.pages[0].elements[0].binding = { key: 'field', required: true };
    const noDefault = resolveRenderTree({ file: emptyValue, input: {}, plugins: registry, fontManager });
    assert.ok(noDefault.issues.some(issue =>
      issue.code === 'MISSING_REQUIRED_INPUT' && issue.inputKey === 'field'
    ), 'empty default still triggers missing');
  });

  it('skips hidden elements without changing the template', () => {
    const file = fixture();
    file.template.pages[0].elements[0].hidden = true;
    const before = structuredClone(file);
    const result = resolveRenderTree({
      file,
      input: {},
      plugins: createPluginRegistry([textPlugin()]),
      fontManager,
    });

    assert.deepEqual(result.pages[0].nodes, []);
    assert.deepEqual(file, before);
  });

  it('reports unknown plugins and invalid resolved input values', () => {
    const file = fixture();
    const missing = resolveRenderTree({
      file,
      input: {},
      plugins: createPluginRegistry([]),
      fontManager,
    });
    assert.ok(missing.issues.some(issue => issue.code === 'UNKNOWN_PLUGIN' && issue.elementId === 'el_1'));

    const invalidValue = resolveRenderTree({
      file,
      input: { field: 42 },
      plugins: createPluginRegistry([textPlugin()]),
      fontManager,
    });
    assert.ok(invalidValue.issues.some(issue => issue.code === 'INVALID_RESOLVED_VALUE' && issue.inputKey === 'field'));
  });

  it('validates image sources before a backend receives the RenderTree', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    const image = imagePlugin.createDefaultElement({ id: 'el_image', position: { x: 10, y: 10 } });
    image.value = { source: 'asset', assetId: 'asset_logo' };
    file.template.pages[0].elements.push(image);
    const registry = createPluginRegistry([imagePlugin]);

    const missing = resolveRenderTree({ file, input: {}, plugins: registry, fontManager });
    assert.ok(missing.issues.some(issue => issue.code === 'MISSING_IMAGE_ASSET'));
    assert.deepEqual(missing.pages[0].nodes, []);

    file.assets.asset_logo = {
      kind: 'image',
      name: 'logo.png',
      mimeType: 'image/png',
      dataEncoding: 'base64',
      data: 'AQIDBA==',
    };
    const valid = resolveRenderTree({ file, input: {}, plugins: registry, fontManager });
    assert.equal(valid.issues.some(issue => issue.severity === 'error'), false);
    assert.equal(valid.pages[0].nodes[0].kind, 'image');

    image.value = { source: 'dataUrl', dataUrl: 'https://example.test/logo.png' };
    const invalidInline = resolveRenderTree({ file, input: {}, plugins: registry, fontManager });
    assert.ok(invalidInline.issues.some(issue => issue.code === 'INVALID_IMAGE_DATA_URL'));
  });

  it('captures plugin failures and rejects invalid node ownership', () => {
    const throwing = textPlugin(() => { throw new Error('build failed'); });
    const failed = resolveRenderTree({
      file: fixture(),
      input: {},
      plugins: createPluginRegistry([throwing]),
      fontManager,
    });
    assert.ok(failed.issues.some(issue => issue.code === 'PLUGIN_BUILD_FAILED' && issue.message === 'build failed'));

    const wrongOwner = textPlugin(({ element, value, context }) => {
      const base = textPlugin().buildRenderNodes({ element, value, context })[0];
      return [{ ...base, sourceElementId: 'el_other' }];
    });
    const invalidNode = resolveRenderTree({
      file: fixture(),
      input: {},
      plugins: createPluginRegistry([wrongOwner]),
      fontManager,
    });
    assert.ok(invalidNode.issues.some(issue => issue.code === 'INVALID_RENDER_NODE_SOURCE'));
    assert.deepEqual(invalidNode.pages[0].nodes, []);
  });
});
