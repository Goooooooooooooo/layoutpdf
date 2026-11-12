import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RenderBuildContext } from '@/engine/core/plugin.js';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import { createPluginRegistry } from '@/engine/core/pluginRegistry.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';
import { summaryPlugin } from './summary.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: (_font, text, size) => text.length * size,
  ensureBrowserFont: async () => 'default',
};

function context(codes: string[] = []): RenderBuildContext {
  return {
    pageId: 'page_1',
    pageSize: { width: 210, height: 297 },
    input: {},
    fontManager,
    format: defaultFormatSettingsForLocale('ja-JP'),
    createNodeId: localId => `summary:node:${localId}`,
    report: issue => codes.push(issue.code),
  };
}

describe('summaryPlugin', () => {
  it('registers a valid empty default and reports a non-blocking warning', () => {
    const registry = createPluginRegistry([summaryPlugin]);
    const element = summaryPlugin.createDefaultElement({
      id: 'summary_1',
      position: { x: 5, y: 6 },
    });
    assert.deepEqual(registry.validateElement(element), []);
    const codes: string[] = [];
    const node = summaryPlugin.buildRenderNodes({ element, value: null, context: context(codes) })[0];
    assert.equal(node.kind, 'grid');
    assert.equal(node.kind === 'grid' && node.columns.length, 1);
    assert.equal(node.kind === 'grid' && node.rows[0].height, element.box.height);
    assert.deepEqual(codes, ['SUMMARY_BLOCK_UNCONFIGURED']);
  });

  it('builds rows with stable bindings and exact box height', () => {
    const element = summaryPlugin.createDefaultElement({
      id: 'summary_1',
      position: { x: 0, y: 0 },
    });
    element.props.items = [{
      id: 'item_1',
      source: { sourceElementId: 'table_1', outputId: 'footer_1' },
      labelMode: 'custom',
      customLabel: 'Grand total',
      width: 2,
      bold: true,
    }];
    const node = summaryPlugin.buildRenderNodes({ element, value: null, context: context() })[0];
    assert.equal(node.kind, 'grid');
    if (node.kind !== 'grid') return;
    assert.equal(node.rows.reduce((sum, row) => sum + (row.height ?? 0), 0), element.box.height);
    assert.deepEqual(node.outputBindings?.map(binding => [binding.cellKey, binding.part]), [
      ['0:label', 'label'],
      ['0:value', 'value'],
    ]);
    assert.equal(node.cells['0:value'].bold, true);
  });

  it('normalizes band row weights against the element height', () => {
    const element = summaryPlugin.createDefaultElement({
      id: 'summary_1',
      position: { x: 0, y: 0 },
    });
    element.box.height = 30;
    element.props.items = [{
      id: 'item_1',
      source: { sourceElementId: 'table_1', outputId: 'footer_1' },
      labelMode: 'source',
      width: 2,
    }];
    element.props.layout = {
      kind: 'band',
      leadLabel: 'Total',
      leadBold: true,
      leadWidth: 1,
      headerWeight: 1,
      valueWeight: 2,
    };
    const node = summaryPlugin.buildRenderNodes({ element, value: null, context: context() })[0];
    assert.equal(node.kind === 'grid' && node.rows[0].height, 10);
    assert.equal(node.kind === 'grid' && node.rows[1].height, 20);
    assert.equal(node.kind === 'grid' && node.cells['0:lead'].rowSpan, 2);
  });

  it('rejects duplicate outputs and non-normalized custom border edges', () => {
    const element = summaryPlugin.createDefaultElement({
      id: 'summary_1',
      position: { x: 0, y: 0 },
    });
    element.props.items = [
      {
        id: 'item_1',
        source: { sourceElementId: 'table_1', outputId: 'footer_1' },
        labelMode: 'source',
        width: 1,
      },
      {
        id: 'item_2',
        source: { sourceElementId: 'table_1', outputId: 'footer_1' },
        labelMode: 'source',
        width: 1,
      },
    ];
    element.props.style = {
      ...element.props.style,
      borderPreset: 'custom',
      borderEdges: ['left', 'top'],
    };
    assert.equal(summaryPlugin.propsSchema.safeParse(element.props).success, false);
  });
});
