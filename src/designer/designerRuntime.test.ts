import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createEngine } from '@/engine/createEngine.js';
import type { PdfFontManager } from '@/engine/pdf/font/fontManager.js';
import { plugins as defaultPlugins } from '@/plugins/index.js';
import Designer from '@/designer/Designer.js';
import type { DesignerCommandApi } from '@/designer/commands.js';
import { setCurrentAppLocale } from '@/i18n/locales.js';
import { ensureCatalogs } from '@/i18n/messages.js';

const window = new Window();
const dom = globalThis as unknown as Record<string, unknown>;
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Element', 'Event', 'CustomEvent', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'ResizeObserver', 'DOMParser', 'MouseEvent']) {
  dom[key] = key === 'window' ? window : (window as unknown as Record<string, unknown>)[key];
}
dom.self = globalThis;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fontManager: PdfFontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: (_name, text, size) => text.length * size * 0.5,
  ensureBrowserFont: async () => 'default',
  embedPdfFont: async () => undefined,
  replaceFontBytes: () => {},
};

function buildEngine() {
  return createEngine({ plugins: defaultPlugins, fontManager });
}

describe('Designer runtime', () => {
  it('exposes the command API and applies the locale prop', async () => {
    const engine = buildEngine();
    const template = engine.createTemplate({ name: 'Runtime' })
      .addElement('text', { x: 10, y: 10, value: 'Hello', binding: { key: 'message' } })
      .build();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref: { current: DesignerCommandApi | null } = { current: null };

    try {
      await ensureCatalogs();
      setCurrentAppLocale('zh-CN');
      await act(async () => {
        root.render(createElement(Designer, {
          engine,
          template,
          locale: 'en-US',
          propertyEditors: {
            text: {
              component: () => createElement('div', { 'data-custom-property-editor': 'true' }, 'Custom text editor'),
            },
          },
          ref: (api: DesignerCommandApi | null) => { ref.current = api; },
        }));
      });

      assert.ok(ref.current);
      assert.equal(ref.current.getTemplate().template.id, template.template.id);
      assert.match(ref.current.exportJson(), /"name": "Runtime"/);
      assert.equal(ref.current.preview().pages.length, 1);
      assert.equal(container.textContent?.includes('Generate PDF'), true);

      // Selecting an element reveals the host-registered property editor.
      assert.equal(container.querySelector('[data-custom-property-editor]'), null);
      const textNode = container.querySelector('[data-render-node-id]');
      assert.ok(textNode);
      await act(async () => {
        textNode.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
      });
      assert.ok(container.querySelector('[data-custom-property-editor]'));

      const next = engine.createTemplate({ name: 'Next' }).build();
      await act(async () => {
        ref.current?.loadTemplate(next);
      });
      assert.equal(ref.current?.getTemplate().template.name, 'Next');
    } finally {
      await act(async () => { root.unmount(); });
      container.remove();
      setCurrentAppLocale('zh-CN');
    }
  });
});
