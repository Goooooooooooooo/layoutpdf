import { useMemo, useReducer } from 'react';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import { getActiveInput } from '@/engine/core/input.js';
import { layoutRenderTree } from '@/engine/renderTree/layout.js';
import type { PluginRegistry } from '@/engine/core/plugin.js';
import type { RenderDocument } from '@/engine/renderTree/model.js';
import { resolveRenderTree } from '@/engine/renderTree/resolve.js';
import type { TemplateFile } from '@/engine/core/document.js';
import type { InputRecord } from '@/engine/core/input.js';
import { pluginRegistry as defaultPluginRegistry } from '@/plugins/index.js';
import {
  createDocumentState,
  documentReducer,
  type DocumentState,
} from '@/editor/state/documentState.js';

export function buildRenderDocument(
  state: Pick<DocumentState, 'templateFile' | 'inputs'>,
  fontManager: FontManager,
  plugins: PluginRegistry = defaultPluginRegistry,
): RenderDocument {
  const logical = resolveRenderTree({
    file: state.templateFile,
    input: getActiveInput(state.inputs),
    plugins,
    fontManager,
  });
  return layoutRenderTree(logical, { fontManager });
}

export function buildDesignRenderDocument(
  file: TemplateFile,
  fontManager: FontManager,
  plugins: PluginRegistry = defaultPluginRegistry,
): RenderDocument {
  const logical = resolveRenderTree({
    file,
    input: {},
    plugins,
    fontManager,
  });
  // The designer canvas shows the template's static layout; table pagination and
  // followed-group movement only apply to input preview and PDF export.
  return layoutRenderTree(logical, { fontManager }, { paginate: false });
}

export function useDocumentState(
  initialFile: TemplateFile,
  fontManager: FontManager,
  initialInput?: InputRecord,
  plugins: PluginRegistry = defaultPluginRegistry,
) {
  const [state, dispatch] = useReducer(
    documentReducer,
    undefined,
    () => createDocumentState(initialFile, initialInput ? [initialInput] : undefined),
  );
  const { templateFile, inputs, mode } = state;
  const renderDocument = useMemo(
    () => mode === 'designer'
      ? buildDesignRenderDocument(templateFile, fontManager, plugins)
      : buildRenderDocument({ templateFile, inputs }, fontManager, plugins),
    [mode, templateFile, inputs, fontManager, plugins],
  );
  return { state, dispatch, renderDocument };
}
