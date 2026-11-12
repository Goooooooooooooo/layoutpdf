import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { createEngine } from '@/engine/createEngine.js';
import { definePlugin } from '@/engine/core/definePlugin.js';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: () => 0,
  ensureBrowserFont: async () => 'default',
};

const rendererPlugin = definePlugin({
  metadata: { type: 'stamp', label: 'Stamp', category: 'business' },
  propsSchema: z.object({}),
  valueSchema: z.string(),
  createDefaultElement: ({ id, position }) => ({
    id,
    type: 'stamp',
    name: 'Stamp',
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
  renderers: {
    pdf: () => undefined,
    dom: () => null,
  },
});

describe('engine renderer registries', () => {
  it('collects plugin-contributed PDF and DOM renderers', () => {
    const engine = createEngine({ plugins: [rendererPlugin], fontManager });

    assert.equal(engine.pdfRenderers.has('stamp'), true);
    assert.equal(engine.domRenderers.has('stamp'), true);
  });

  it('lets host-provided renderers override plugin defaults', () => {
    const hostPdf = () => undefined;
    const hostDom = () => null;
    const engine = createEngine({
      plugins: [rendererPlugin],
      fontManager,
      pdfRenderers: [{ pluginType: 'stamp', render: hostPdf }],
      domRenderers: [{ pluginType: 'stamp', render: hostDom }],
    });

    assert.equal(engine.pdfRenderers.get('stamp'), hostPdf);
    assert.equal(engine.domRenderers.get('stamp'), hostDom);
  });
});
