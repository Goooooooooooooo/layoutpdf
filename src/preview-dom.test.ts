import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Window } from 'happy-dom';
import { createEngine } from '@/engine/createEngine.js';
import type { PdfFontManager } from '@/engine/pdf/font/fontManager.js';
import { definePlugin } from '@/engine/core/definePlugin.js';
import { z } from 'zod';
import { plugins as defaultPlugins } from '@/plugins/index.js';
import { mmToCssPx } from '@/engine/utils/units.js';
import {
  createDomPreview,
  mountDomPreview,
  renderDomPreview,
} from '@/preview-dom.js';

const window = new Window();
const dom = globalThis as unknown as {
  document: Document;
  Node: typeof Node;
};
dom.document = window.document as unknown as Document;
dom.Node = window.Node as unknown as typeof Node;

const fontManager: PdfFontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: (_name, text, size) => text.length * size * 0.5,
  ensureBrowserFont: async () => 'default',
  embedPdfFont: async () => undefined,
  replaceFontBytes: () => {},
};

function createDocument() {
  const engine = createEngine({
    plugins: defaultPlugins,
    fontManager,
    format: {
      locale: 'en-US',
      currency: 'USD',
      calendar: 'gregory',
      timeZone: 'America/New_York',
    },
  });
  const template = engine
    .createTemplate({ name: 'DOM preview' })
    .addElement('text', {
      x: 20,
      y: 20,
      box: { width: 80, height: 10 },
      value: 'Hello preview',
      binding: { key: 'message' },
    })
    .addElement('rect', {
      x: 20,
      y: 40,
      box: { width: 40, height: 20 },
      props: { fill: '#f0f0f0' },
    })
    .addElement('line', {
      x: 20,
      y: 70,
      box: { width: 60, height: 1 },
    })
    .build();
  return engine.createDocument(template, { message: 'Hello DOM' }).preview();
}

describe('preview-dom', () => {
  it('renders pages and nodes without React', () => {
    const documentModel = createDocument();
    const root = renderDomPreview(documentModel, { zoom: 1.5 });

    assert.equal(root.dataset.renderDocumentId, documentModel.templateId);
    const page = root.querySelector<HTMLElement>('[data-render-page-id]');
    assert.ok(page);
    assert.equal(
      Number.parseFloat(page.style.width),
      Math.round(mmToCssPx(documentModel.pages[0].size.width, 1.5) * 1e6) / 1e6,
    );
    assert.ok(root.querySelector('[data-node-kind="text"]'));
    assert.ok(root.querySelector('[data-node-kind="rect"]'));
    assert.ok(root.querySelector('[data-node-kind="line"]'));
    assert.equal(root.textContent?.includes('Hello DOM'), true);
  });

  it('mounts, updates, and destroys', () => {
    const container = document.createElement('div');
    const handle = mountDomPreview(container, createDocument());
    assert.equal(container.querySelectorAll('[data-render-page-id]').length, 1);

    const engine = createEngine({
      plugins: defaultPlugins,
      fontManager,
    });
    const twoPages = engine
      .createTemplate({ name: 'Two pages' })
      .addElement('text', { x: 0, y: 0, value: 'One' })
      .addPage()
      .build();
    handle.update(engine.createDocument(twoPages).preview());
    assert.equal(container.querySelectorAll('[data-render-page-id]').length, 2);

    handle.destroy();
    assert.equal(container.children.length, 0);
  });

  it('renders form inputs and reports edits', () => {
    const engine = createEngine({ plugins: defaultPlugins, fontManager });
    const template = engine
      .createTemplate({ name: 'Form' })
      .addElement('text', {
        x: 10,
        y: 10,
        binding: { key: 'customer' },
        props: { multiline: false },
      })
      .build();
    const documentModel = engine.createDocument(template, { customer: 'Acme' }).preview();
    const changes: unknown[] = [];

    const handle = createDomPreview(documentModel, {
      mode: 'form',
      onInputChange: (key, value) => changes.push([key, value]),
    });
    const input = handle.element.querySelector<HTMLInputElement>('input');
    assert.ok(input);
    assert.equal(input.value, 'Acme');

    input.value = 'Globex';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.deepEqual(changes, [['customer', 'Globex']]);
  });

  it('uses plugin DOM renderers that return a DOM node', () => {
    const stampPlugin = definePlugin({
      metadata: { type: 'stamp', label: 'Stamp', category: 'business' },
      propsSchema: z.object({}),
      valueSchema: z.string(),
      createDefaultElement: ({ id, position }) => ({
        id,
        type: 'stamp',
        name: 'Stamp',
        box: { ...position, width: 20, height: 10 },
        rotate: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        value: 'APPROVED',
        props: {},
      }),
      properties: [],
      buildRenderNodes: ({ element, value }) => [{
        kind: 'plugin',
        id: `${element.id}:node:0`,
        sourceElementId: element.id,
        box: { ...element.box },
        rotate: element.rotate,
        opacity: element.opacity,
        clip: false,
        zIndex: 0,
        pluginType: 'stamp',
        payload: {},
        textRuns: [{ text: value }],
      }],
      renderers: {
        dom() {
          const node = document.createElement('strong');
          node.textContent = 'STAMP';
          return node;
        },
      },
    });

    const engine = createEngine({ plugins: [stampPlugin], fontManager });
    const template = engine
      .createTemplate({ name: 'Plugin' })
      .addElement('stamp', { x: 10, y: 10 })
      .build();
    const documentModel = engine.createDocument(template).preview();

    const root = renderDomPreview(documentModel, { pluginRenderers: engine.domRenderers });
    assert.equal(root.querySelector('[data-plugin-type]'), null);
    assert.equal(root.textContent?.includes('STAMP'), true);
  });
});
