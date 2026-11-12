import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { rgb } from 'pdf-lib';
import { z } from 'zod';
import { createBlankTemplateFile } from '@/engine/core/document.js';
import { definePlugin } from '@/engine/core/definePlugin.js';
import { createPluginRegistry } from '@/engine/core/pluginRegistry.js';
import {
  collectPluginRenderers,
  createPluginRendererRegistry,
} from '@/engine/core/pluginRendererRegistry.js';
import { layoutRenderTree } from '@/engine/renderTree/layout.js';
import { resolveRenderTree } from '@/engine/renderTree/resolve.js';
import { createFontManager } from '@/engine/pdf/font/fontManager.js';
import { renderDocumentPdf } from '@/engine/pdf/render/renderDocumentPdf.js';
import type { RenderDocument } from '@/engine/renderTree/model.js';
import { LayoutPDFValidationError } from '@/engine/utils/errors.js';
import { DEFAULT_FORMAT_LOCALE_SETTINGS } from '@/i18n/locales.js';
import { createPdfFontFromBytes } from '@/fonts.js';

describe('custom plugin nodes', () => {
  it('resolves a plugin node and paints it through a registered PDF renderer', async () => {
    const calls: string[] = [];
    const stampPlugin = definePlugin({
      metadata: { type: 'stamp', label: 'Stamp', category: 'business' },
      propsSchema: z.object({ label: z.string() }),
      valueSchema: z.string(),
      createDefaultElement: ({ id, position }) => ({
        id,
        type: 'stamp',
        name: 'Stamp',
        box: { ...position, width: 30, height: 20 },
        rotate: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        value: 'APPROVED',
        props: { label: 'APPROVED' },
      }),
      properties: [],
      buildRenderNodes: ({ element }) => [{
        kind: 'plugin',
        id: `${element.id}:node:0`,
        sourceElementId: element.id,
        box: { ...element.box },
        rotate: 0,
        opacity: 1,
        clip: false,
        zIndex: 0,
        pluginType: 'stamp',
        payload: { label: (element.props as { label: string }).label },
        textRuns: [{ text: 'APPROVED' }],
      }],
      renderers: {
        pdf: (node, context) => {
          calls.push(node.pluginType);
          context.page.drawRectangle({
            x: 20,
            y: 20,
            width: 20,
            height: 20,
            color: rgb(0.8, 0.1, 0.1),
          });
        },
      },
    });

    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_plugin` });
    const element = stampPlugin.createDefaultElement({ id: 'el_stamp', position: { x: 10, y: 10 } });
    file.template.pages[0].elements.push(element);

    const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));
    const fontManager = createFontManager(createPdfFontFromBytes(fontBytes, 'Test CJK'));
    const plugins = createPluginRegistry([stampPlugin]);

    const resolved = resolveRenderTree({ file, input: {}, plugins, fontManager });
    assert.equal(resolved.issues.filter(issue => issue.severity === 'error').length, 0);
    const resolvedNode = resolved.pages[0].nodes[0];
    assert.equal(resolvedNode.kind, 'plugin');
    assert.equal(resolvedNode.kind === 'plugin' && resolvedNode.pluginType, 'stamp');

    const laidOut = layoutRenderTree(resolved, { fontManager });
    const pdfRenderers = createPluginRendererRegistry([
      ...collectPluginRenderers([stampPlugin], 'pdf'),
    ]);
    const bytes = await renderDocumentPdf({
      document: laidOut,
      file,
      fontManager,
      pdfRenderers,
    });

    assert.deepEqual(calls, ['stamp']);
    assert.ok(bytes.byteLength > 0);
  });

  it('reports a missing plugin renderer before painting', async () => {
    const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));
    const fontManager = createFontManager(createPdfFontFromBytes(fontBytes, 'Test CJK'));
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_missing` });
    const document: RenderDocument = {
      templateId: file.template.id,
      format: DEFAULT_FORMAT_LOCALE_SETTINGS,
      pages: [{
        id: 'page_1',
        sourcePageId: 'page_1',
        continuationIndex: 0,
        size: { width: 210, height: 297 },
        padding: [0, 0, 0, 0],
        background: { kind: 'blank', color: '#ffffff' },
        nodes: [{
          kind: 'plugin',
          id: 'node_1',
          sourceElementId: 'el_1',
          box: { x: 10, y: 10, width: 20, height: 20 },
          rotate: 0,
          opacity: 1,
          clip: false,
          zIndex: 0,
          pluginType: 'unregistered',
          payload: {},
        }],
      }],
      issues: [],
    };

    await assert.rejects(
      () => renderDocumentPdf({ document, file, fontManager }),
      (error: unknown) => {
        assert.ok(error instanceof LayoutPDFValidationError);
        assert.equal(error.issues[0]?.code, 'MISSING_PLUGIN_RENDERER');
        return true;
      },
    );
  });

  it('reports an invalid plugin node instead of crashing layout', () => {
    const brokenPlugin = definePlugin({
      metadata: { type: 'broken', label: 'Broken', category: 'business' },
      propsSchema: z.object({}),
      valueSchema: z.string(),
      createDefaultElement: ({ id, position }) => ({
        id,
        type: 'broken',
        name: 'Broken',
        box: { ...position, width: 10, height: 10 },
        rotate: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        value: '',
        props: {},
      }),
      properties: [],
      buildRenderNodes: ({ element }) => [{
        kind: 'plugin',
        id: `${element.id}:node:0`,
        sourceElementId: element.id,
        box: { ...element.box },
        rotate: 0,
        opacity: 1,
        clip: false,
        zIndex: 0,
        pluginType: '',
        payload: {},
      }],
    });

    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_broken` });
    file.template.pages[0].elements.push(
      brokenPlugin.createDefaultElement({ id: 'el_broken', position: { x: 0, y: 0 } }),
    );

    const fontManager: ReturnType<typeof createFontManager> = createFontManager(
      createPdfFontFromBytes(new Uint8Array(), 'Empty'),
    );
    // Layout validation only needs the FontManager interface; no text is measured.
    const resolved = resolveRenderTree({
      file,
      input: {},
      plugins: createPluginRegistry([brokenPlugin]),
      fontManager,
    });

    assert.ok(resolved.issues.some(issue => issue.code === 'INVALID_PLUGIN_NODE'));
  });
});
