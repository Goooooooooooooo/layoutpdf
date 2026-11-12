import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { definePlugin } from '@/engine/core/definePlugin.js';
import type { AnyLayoutPDFPlugin } from '@/engine/core/plugin.js';
import {
  collectPluginRenderers,
  createPluginRendererRegistry,
} from '@/engine/core/pluginRendererRegistry.js';

const passthroughPlugin = (type: string, renderers?: AnyLayoutPDFPlugin['renderers']): AnyLayoutPDFPlugin =>
  definePlugin({
    metadata: { type, label: type, category: 'business' },
    propsSchema: z.object({}),
    valueSchema: z.string(),
    createDefaultElement: ({ id, position }) => ({
      id,
      type,
      name: type,
      box: { ...position, width: 10, height: 10 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: '',
      props: {},
    }),
    properties: [],
    buildRenderNodes: () => [],
    renderers,
  });

describe('plugin renderer registry', () => {
  it('registers and resolves renderers by plugin type', () => {
    const render = () => undefined;
    const registry = createPluginRendererRegistry([{ pluginType: 'stamp', render }]);

    assert.equal(registry.has('stamp'), true);
    assert.equal(registry.get('stamp'), render);
    assert.equal(registry.require('stamp'), render);
    assert.deepEqual(registry.list().map(entry => entry.pluginType), ['stamp']);
  });

  it('fails loudly when a renderer is missing', () => {
    const registry = createPluginRendererRegistry([]);
    assert.throws(() => registry.require('missing'), /No renderer registered/);
  });

  it('rejects duplicate types by default and allows explicit overrides', () => {
    const first = () => undefined;
    const second = () => undefined;

    assert.throws(
      () => createPluginRendererRegistry([
        { pluginType: 'stamp', render: first },
        { pluginType: 'stamp', render: second },
      ]),
      /Duplicate plugin renderer/,
    );

    const overridden = createPluginRendererRegistry([
      { pluginType: 'stamp', render: first },
      { pluginType: 'stamp', render: second },
    ], { onDuplicate: 'override' });
    assert.equal(overridden.get('stamp'), second);
  });

  it('collects renderers contributed by plugins', () => {
    const pdfRender = () => undefined;
    const domRender = () => undefined;
    const plugin = passthroughPlugin('stamp', { pdf: pdfRender, dom: domRender });

    assert.deepEqual(
      collectPluginRenderers([plugin], 'pdf').map(entry => [entry.pluginType, entry.render]),
      [['stamp', pdfRender]],
    );
    assert.deepEqual(
      collectPluginRenderers([plugin], 'dom').map(entry => [entry.pluginType, entry.render]),
      [['stamp', domRender]],
    );
  });
});
