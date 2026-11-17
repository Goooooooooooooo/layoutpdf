import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBlankTemplateFile } from '@/engine/core/document.js';
import { pluginRegistry } from '@/plugins/index.js';
import { layoutRenderTree } from '@/engine/renderTree/layout.js';
import { RENDER_DOCUMENT_VERSION } from '@/engine/renderTree/model.js';
import { resolveRenderTree } from '@/engine/renderTree/resolve.js';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';

const fontManager: FontManager = {
  getDefaultFontName: () => 'default',
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: () => 0,
  ensureBrowserFont: async () => 'default',
};

function resolve(file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` })) {
  return resolveRenderTree({
    file,
    input: {},
    plugins: pluginRegistry,
    fontManager,
  });
}

describe('RenderDocument version', () => {
  it('stamps the current IR version on resolved and laid-out documents', () => {
    const resolved = resolve();
    const laidOut = layoutRenderTree(resolved, { fontManager });

    assert.equal(RENDER_DOCUMENT_VERSION, 1);
    assert.equal(resolved.version, RENDER_DOCUMENT_VERSION);
    assert.equal(laidOut.version, RENDER_DOCUMENT_VERSION);
  });

  it('stamps the version even when the template is structurally invalid', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    const invalid = { ...file, version: 2 } as unknown as typeof file;
    const fallback = resolve(invalid);

    assert.equal(fallback.version, RENDER_DOCUMENT_VERSION);
    assert.ok(fallback.issues.length > 0);
  });

  it('keeps the version through pagination', () => {
    const laidOut = layoutRenderTree(resolve(), { fontManager });
    const paginated = layoutRenderTree(laidOut, { fontManager });

    assert.equal(paginated.version, RENDER_DOCUMENT_VERSION);
  });
});
