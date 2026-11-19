import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import type { TextNode } from '@/engine/renderTree/model.js';
import { layoutTextNode } from '@/engine/renderTree/textLayout.js';
import { createTextNode, defaultTextVisualProps, textStyleProperties } from '@/plugins/textShared.js';
import type { RenderBuildContext } from '@/engine/core/plugin.js';

const DEFAULT_FACE = 'Body Regular';

const requestedNames: string[] = [];

const fontManager: FontManager = {
  getDefaultFontName: () => DEFAULT_FACE,
  getFontBytes: () => new Uint8Array(),
  assertTextSupported: () => {},
  measureText: (_name, text, size) => Array.from(text).length * size * 0.5,
  ensureBrowserFont: async name => name,
  resolveFontFace: (name, weight) => ({
    name: weight === 'bold' ? `${name} Bold` : name,
    syntheticBold: false,
  }),
  listFontFamilies: () => [{
    family: 'Heading',
    defaultFace: 'Heading',
    faces: [{ name: 'Heading', weight: 'normal' }],
  }],
};

function textNode(props: Partial<ReturnType<typeof defaultTextVisualProps>> = {}): TextNode {
  const context: RenderBuildContext = {
    pageId: 'page_1',
    pageSize: { width: 210, height: 297 },
    input: {},
    fontManager,
    format: {} as RenderBuildContext['format'],
    createNodeId: localId => `el_1:node:${localId}`,
    report: () => {},
  };
  return createTextNode({
    element: {
      id: 'el_1',
      box: { x: 0, y: 0, width: 120, height: 20 },
      rotate: 0,
      opacity: 1,
      props: { ...defaultTextVisualProps(), ...props },
    },
    text: '請求書',
    context,
  });
}

describe('element font selection', () => {
  it('lays out with the face the element names', () => {
    requestedNames.length = 0;
    const laidOut = layoutTextNode(textNode({ fontName: 'Heading' }), {
      ...fontManager,
      measureText: (name, text, size) => {
        requestedNames.push(name);
        return Array.from(text).length * size * 0.5;
      },
    });

    assert.equal(laidOut.style.fontName, 'Heading');
    assert.ok(requestedNames.every(name => name === 'Heading'));
  });

  it('uses the manager default when the element leaves the font unset', () => {
    const laidOut = layoutTextNode(textNode(), fontManager);

    assert.equal(laidOut.style.fontName, DEFAULT_FACE);
  });

  it('asks the weight toggle for the sibling face of the chosen family', () => {
    const laidOut = layoutTextNode(textNode({ fontName: 'Heading', fontWeight: 'bold' }), fontManager);

    assert.equal(laidOut.style.fontName, 'Heading Bold');
  });

  it('exposes the picker in the shared text style properties', () => {
    const definition = textStyleProperties().find(item => item.path === 'props.fontName');

    assert.equal(definition?.editor, 'font');
    assert.equal(definition?.cleareable, true);
  });
});
