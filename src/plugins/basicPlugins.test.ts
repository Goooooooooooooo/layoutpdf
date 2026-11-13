import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FontManager } from '../engine/pdf/font/fontManager.js';
import { createBlankTemplateFile } from '../engine/core/document.js';
import type { RenderBuildContext } from '../engine/core/plugin.js';
import { resolveRenderTree } from '../engine/renderTree/resolve.js';
import { calcPlugin } from './calc/calc.js';
import { checkboxPlugin } from './checkbox/checkbox.js';
import { currencyPlugin } from './currency/currency.js';
import { datePlugin } from './date/date.js';
import { ellipsePlugin } from './ellipse/ellipse.js';
import { imagePlugin } from './image/image.js';
import { pluginRegistry, plugins } from './index.js';
import { labelPlugin } from './label/label.js';
import { linePlugin } from './line/line.js';
import { numberPlugin } from './number/number.js';
import { rectPlugin } from './rect/rect.js';
import { BorderSchema } from './textShared.js';
import { defaultFormatSettingsForLocale, resolveMessageLabel } from '@/i18n/index.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: () => 0,
  ensureBrowserFont: async () => 'default',
};

const jaFormat = defaultFormatSettingsForLocale('ja-JP');

function context(issues: Array<{ code: string }> = []): RenderBuildContext {
  return {
    pageId: 'page_1',
    pageSize: { width: 210, height: 297 },
    input: {},
    fontManager,
    format: jaFormat,
    createNodeId: localId => `el_1:node:${localId}`,
    report: issue => issues.push(issue),
  };
}

describe('Phase 5 basic plugins', () => {
  it('registers all plugins as plain object contracts with valid defaults', () => {
    assert.deepEqual(pluginRegistry.list().map(plugin => plugin.metadata.type), [
      'label', 'text', 'number', 'currency', 'date', 'select', 'radiogroup', 'calc', 'checkbox', 'line', 'rect', 'ellipse', 'image', 'qrcode', 'barcode', 'grid', 'table', 'summary',
    ]);
    for (const plugin of plugins) {
      const element = plugin.createDefaultElement({ id: 'el_1', position: { x: 2, y: 3 } });
      assert.equal(element.id, 'el_1');
      assert.equal(element.type, plugin.metadata.type);
      assert.equal(pluginRegistry.validateElement(element).length, 0);
    }
  });

  it('exposes localized labels for bundled plugin metadata and properties', () => {
    const missing: string[] = [];
    for (const plugin of plugins) {
      if (!plugin.metadata.labelKey) missing.push(`${plugin.metadata.type}:metadata`);
      assert.equal(resolveMessageLabel(plugin.metadata), plugin.metadata.label);

      for (const property of plugin.properties) {
        if (!property.labelKey) missing.push(`${plugin.metadata.type}:${property.path}`);
        assert.equal(resolveMessageLabel(property), property.label);
        for (const option of property.options ?? []) {
          if (!option.labelKey) missing.push(`${plugin.metadata.type}:${property.path}:${String(option.value)}`);
          assert.equal(resolveMessageLabel(option), option.label);
        }
      }
    }
    assert.deepEqual(missing, []);
  });

  it('formats label, number, currency, and date values into text nodes', () => {
    const label = labelPlugin.createDefaultElement({ id: 'el_1', position: { x: 0, y: 0 } });
    assert.equal(label.value, 'ラベル');
    const number = numberPlugin.createDefaultElement({ id: 'el_1', position: { x: 0, y: 0 } });
    const currency = currencyPlugin.createDefaultElement({ id: 'el_1', position: { x: 0, y: 0 } });
    const date = datePlugin.createDefaultElement({ id: 'el_1', position: { x: 0, y: 0 } });

    const labelNode = labelPlugin.buildRenderNodes({ element: label, value: '請求書', context: context() })[0];
    const numberNode = numberPlugin.buildRenderNodes({ element: number, value: 1234, context: context() })[0];
    const currencyNode = currencyPlugin.buildRenderNodes({ element: currency, value: 1234, context: context() })[0];
    const dateNode = datePlugin.buildRenderNodes({ element: date, value: '2026-07-13', context: context() })[0];

    assert.equal(labelNode.kind === 'text' && labelNode.text, '請求書');
    assert.equal(numberNode.kind === 'text' && numberNode.text, '1,234');
    assert.equal(currencyNode.kind === 'text' && currencyNode.text, '¥1,234');
    assert.equal(dateNode.kind === 'text' && dateNode.text, '2026年7月13日');
    assert.equal(numberNode.input?.value, 1234);
    assert.equal(currencyNode.input?.value, 1234);
    assert.equal(dateNode.input?.value, '2026-07-13');
  });

  it('keeps the suffix when a currency value uses the left-edge layout', () => {
    const edge = currencyPlugin.createDefaultElement({ id: 'edge', position: { x: 0, y: 0 } });
    edge.props.symbolLayout = 'edge';
    edge.props.suffix = '円';
    const nodes = currencyPlugin.buildRenderNodes({ element: edge, value: 1234, context: context() });
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].kind === 'text' && nodes[0].text, '¥');
    assert.equal(nodes[1].kind === 'text' && nodes[1].text, '1,234円');
  });

  it('applies the configured negative currency style', () => {
    const element = currencyPlugin.createDefaultElement({ id: 'negative', position: { x: 0, y: 0 } });
    element.props.negativeStyle = 'parentheses';
    const nodes = currencyPlugin.buildRenderNodes({ element, value: -1000, context: context() });
    assert.equal(nodes[0].kind === 'text' && nodes[0].text, '(¥1,000)');
  });

  it('builds Currency field references with attached or left-edge symbols', () => {
    const attached = currencyPlugin.createDefaultElement({ id: 'attached', position: { x: 0, y: 0 } });
    attached.props.source = { kind: 'field', key: 'invoiceTotal' };
    const attachedNodes = currencyPlugin.buildRenderNodes({ element: attached, value: '', context: context() });
    assert.equal(attachedNodes.length, 1);
    assert.equal(attachedNodes[0].kind === 'text' && attachedNodes[0].fieldReference?.key, 'invoiceTotal');
    assert.equal(attachedNodes[0].kind === 'text' && attachedNodes[0].fieldReference?.prefix, '¥');

    const edge = { ...attached, id: 'edge', props: { ...attached.props, symbolLayout: 'edge' as const } };
    const edgeNodes = currencyPlugin.buildRenderNodes({ element: edge, value: '', context: context() });
    assert.equal(edgeNodes.length, 2);
    assert.equal(edgeNodes[0].kind === 'text' && edgeNodes[0].text, '¥');
    assert.equal(edgeNodes[1].kind === 'text' && edgeNodes[1].fieldReference?.prefix, '');
    assert.notEqual(edgeNodes[0].id, edgeNodes[1].id);
  });

  it('uses document locale settings while building formatted plugin text', () => {
    const date = datePlugin.createDefaultElement({ id: 'el_1', position: { x: 0, y: 0 } });
    const localizedContext = context();
    localizedContext.format = defaultFormatSettingsForLocale('en-US');

    const dateNode = datePlugin.buildRenderNodes({
      element: date,
      value: '2026-07-13',
      context: localizedContext,
    })[0];

    assert.equal(dateNode.kind === 'text' && dateNode.text, 'July 13, 2026');
  });

  it('requires deterministic full date input values', () => {
    assert.equal(datePlugin.valueSchema.safeParse('2026-07-13').success, true);
    assert.equal(datePlugin.valueSchema.safeParse('').success, true);
    assert.equal(datePlugin.valueSchema.safeParse('07/13').success, false);
  });

  it('emits calc formulas for the shared formula resolution phase', () => {
    const element = calcPlugin.createDefaultElement({ id: 'el_1', position: { x: 0, y: 0 } });
    const valid = calcPlugin.buildRenderNodes({ element, value: '1000 + 250', context: context() })[0];
    assert.equal(valid.kind === 'text' && valid.text, '');
    assert.equal(valid.kind === 'text' && valid.numericFormula?.expression, '1000 + 250');
    assert.equal(valid.input, undefined);

    const issues: Array<{ code: string }> = [];
    const invalid = calcPlugin.buildRenderNodes({ element, value: '1 +', context: context(issues) })[0];
    assert.equal(invalid.kind === 'text' && invalid.text, '');
    assert.equal(invalid.kind === 'text' && invalid.numericFormula?.expression, '1 +');
    assert.deepEqual(issues, []);
  });

  it('keeps input-dependent calc formulas unresolved in the plugin layer', () => {
    const element = calcPlugin.createDefaultElement({ id: 'el_1', position: { x: 0, y: 0 } });
    const calcContext = context();
    calcContext.input = { subtotal: 1000, tax: 100 };
    const node = calcPlugin.buildRenderNodes({
      element,
      value: 'field.subtotal + field.tax',
      context: calcContext,
    })[0];
    assert.equal(node.kind === 'text' && node.text, '');
    assert.equal(node.kind === 'text' && node.numericFormula?.expression, 'field.subtotal + field.tax');
  });

  it('evaluates calc formulas from bound element defaults when input is absent', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    const quantity = numberPlugin.createDefaultElement({ id: 'el_quantity', position: { x: 0, y: 0 } });
    quantity.binding = { key: 'quantity' };
    quantity.value = 2;
    const price = currencyPlugin.createDefaultElement({ id: 'el_price', position: { x: 0, y: 20 } });
    price.binding = { key: 'price' };
    price.value = 300;
    const total = calcPlugin.createDefaultElement({ id: 'el_total', position: { x: 0, y: 40 } });
    total.value = 'field.quantity * field.price';
    file.template.pages[0].elements.push(quantity, price, total);

    const document = resolveRenderTree({ file, input: {}, plugins: pluginRegistry, fontManager });
    const node = document.pages[0].nodes.find(candidate => candidate.sourceElementId === 'el_total');
    assert.equal(node?.kind === 'text' && node.text, '¥600');
    assert.equal(document.issues.some(issue => issue.code === 'INVALID_FORMULA'), false);
  });

  it('builds line and image nodes without backend data', () => {
    const line = linePlugin.createDefaultElement({ id: 'el_1', position: { x: 0, y: 0 } });
    const rect = rectPlugin.createDefaultElement({ id: 'el_2', position: { x: 0, y: 5 } });
    const image = imagePlugin.createDefaultElement({ id: 'el_1', position: { x: 0, y: 0 } });
    const lineNode = linePlugin.buildRenderNodes({ element: line, value: null, context: context() })[0];
    const rectNode = rectPlugin.buildRenderNodes({ element: rect, value: null, context: context() })[0];
    const imageNode = imagePlugin.buildRenderNodes({
      element: image,
      value: { source: 'asset', assetId: 'asset_logo' },
      context: context(),
    })[0];

    assert.equal(lineNode.kind, 'line');
    assert.equal(rectNode.kind, 'rect');
    assert.deepEqual(lineNode.kind === 'line' && lineNode.from, { x: 0, y: 1 });
    assert.equal(imageNode.kind === 'image' && imageNode.assetId, 'asset_logo');
    assert.equal('mode' in lineNode, false);
    assert.equal('mode' in imageNode, false);
  });

  it('fills missing border fields with defaults during Zod parsing', () => {
    const parsed = BorderSchema.safeParse({ color: '#ff0000' });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.width, 0);
      assert.equal(parsed.data.color, '#ff0000');
      assert.equal(parsed.data.style, 'solid');
    }
  });

  it('builds a checkbox from existing rect and text nodes', () => {
    const element = checkboxPlugin.createDefaultElement({ id: 'el_1', position: { x: 0, y: 0 } });
    const nodes = checkboxPlugin.buildRenderNodes({ element, value: true, context: context() });
    assert.deepEqual(nodes.map(node => node.kind), ['rect', 'text']);
    assert.equal(nodes[1].input?.kind, 'checkbox');
  });

  it('builds an ellipse node for non-rectangular geometry', () => {
    const element = ellipsePlugin.createDefaultElement({ id: 'el_1', position: { x: 0, y: 0 } });
    const node = ellipsePlugin.buildRenderNodes({ element, value: null, context: context() })[0];
    assert.equal(node.kind, 'ellipse');
    assert.notEqual(element.box.width, element.box.height);
  });
});
