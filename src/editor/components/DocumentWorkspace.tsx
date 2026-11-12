import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { JsonValue, TemplateElement } from '@/engine/core/document.js';
import type { RenderDocument } from '@/engine/renderTree/model.js';
import IconButton from '@/ui/button/IconButton.js';
import Icon from '@/ui/icon/Icon.js';
import { t } from '@/i18n/index.js';
import DocumentCanvas from '@/editor/components/DocumentCanvas.js';
import ElementPalette from '@/editor/components/ElementPalette.js';
import ElementPropertyPanel from '@/editor/components/ElementPropertyPanel.js';
import type { DocumentAction, DocumentState } from '@/editor/state/documentState.js';
import {
  clampPalettePanelWidth,
  clampPropertiesPanelWidth,
  PALETTE_PANEL_DEFAULT_WIDTH,
  PROPERTIES_PANEL_DEFAULT_WIDTH,
  workspaceClassName,
} from '@/editor/layout/workspaceLayout.js';
import { useSettings } from '@/settings/settingsContext.js';
import type { ReusableBlock } from '@/storage/reusableBlockRepository.js';
import type { GridProps } from '@/plugins/grid/grid.js';
import type { PluginRegistry } from '@/engine/core/plugin.js';
import type { ElementPreset } from '@/presets/types.js';
import GridEditorWorkspace from '@/editor/components/propertyPanel/grid/GridEditorWorkspace.js';
import { GridEditorContext } from '@/editor/components/propertyPanel/grid/gridEditorContext.js';

interface DocumentWorkspaceProps {
  state: DocumentState;
  document: RenderDocument;
  dispatch: Dispatch<DocumentAction>;
  plugins?: PluginRegistry;
  presets?: ElementPreset[];
  reusableBlocks: ReusableBlock[];
  onSaveReusableBlock(block: ReusableBlock): Promise<void>;
  onDeleteReusableBlock(id: string): Promise<void>;
  hasClipboard: boolean;
  onCopy(ids: string[]): void;
  onPaste(): void;
}

function restoreGridEditorFocus(elementId: string | null): void {
  const trigger = [...globalThis.document.querySelectorAll<HTMLButtonElement>('[data-grid-editor-trigger]')]
    .find(button => button.dataset.gridEditorTrigger === elementId);
  (trigger ?? globalThis.document.querySelector<HTMLElement>('.layoutpdf-properties-collapsed button, .layoutpdf-canvas-viewport'))
    ?.focus();
}

export default function DocumentWorkspace({
  state,
  document,
  dispatch,
  plugins,
  presets,
  reusableBlocks,
  onSaveReusableBlock,
  onDeleteReusableBlock,
  hasClipboard,
  onCopy,
  onPaste,
}: DocumentWorkspaceProps) {
  const [gridEditorElementId, setGridEditorElementId] = useState<string | null>(null);
  const pendingGridFocusRef = useRef<string | null | undefined>(undefined);
  const { editor, setEditorPreferences } = useSettings();
  const propertiesCollapsed = editor.propertiesCollapsed ?? false;
  const paletteCollapsed = editor.paletteCollapsed ?? false;
  const propertiesPanelWidth = clampPropertiesPanelWidth(
    editor.propertiesPanelWidth ?? PROPERTIES_PANEL_DEFAULT_WIDTH,
  );
  const palettePanelWidth = clampPalettePanelWidth(
    editor.palettePanelWidth ?? PALETTE_PANEL_DEFAULT_WIDTH,
  );
  const setPropertiesCollapsed = (collapsed: boolean) =>
    setEditorPreferences({ ...editor, propertiesCollapsed: collapsed });
  const setPaletteCollapsed = (collapsed: boolean) =>
    setEditorPreferences({ ...editor, paletteCollapsed: collapsed });
  const setPropertiesPanelWidth = (width: number) =>
    setEditorPreferences({ ...editor, propertiesPanelWidth: clampPropertiesPanelWidth(width) });
  const setPalettePanelWidth = (width: number) =>
    setEditorPreferences({ ...editor, palettePanelWidth: clampPalettePanelWidth(width) });
  const gridElement = gridEditorElementId
    ? state.templateFile.template.pages.flatMap(page => page.elements)
      .find(element => element.id === gridEditorElementId && element.type === 'grid') as TemplateElement<GridProps, string> | undefined
    : undefined;
  const gridEditorController = useMemo(() => ({ open: setGridEditorElementId }), []);
  const closeGridEditor = () => {
    pendingGridFocusRef.current = gridEditorElementId;
    setGridEditorElementId(null);
  };
  useEffect(() => {
    if (!gridEditorElementId) return;
    if (state.mode !== 'designer' || !state.selectedElementIds.includes(gridEditorElementId)) {
      const activeElement = globalThis.document.activeElement;
      if (
        !activeElement
        || activeElement === globalThis.document.body
        || !activeElement.isConnected
        || activeElement.closest('.layoutpdf-grid-workspace')
      ) {
        pendingGridFocusRef.current = gridEditorElementId;
      }
      setGridEditorElementId(null);
    }
  }, [gridEditorElementId, state.mode, state.selectedElementIds]);
  useEffect(() => {
    if (gridEditorElementId !== null || pendingGridFocusRef.current === undefined) return;
    const elementId = pendingGridFocusRef.current;
    pendingGridFocusRef.current = undefined;
    requestAnimationFrame(() => restoreGridEditorFocus(elementId));
  }, [gridEditorElementId]);

  return (
    <GridEditorContext.Provider value={gridEditorController}>
    <div className={workspaceClassName(state.mode) + (propertiesCollapsed ? ' properties-collapsed' : '') + (paletteCollapsed ? ' palette-collapsed' : '') + (gridElement ? ' grid-editing' : '')}>
      {state.mode === 'designer' ? (
        paletteCollapsed ? (
          <aside className="layoutpdf-palette-collapsed">
            <IconButton
              size="sm"
              title={t('editor.palette.expand')}
              aria-label={t('editor.palette.expand')}
              onClick={() => setPaletteCollapsed(false)}
            >
              <Icon name="chevron-right" />
            </IconButton>
          </aside>
        ) : (
          <ElementPalette
            state={state}
            dispatch={dispatch}
            plugins={plugins}
            presets={presets}
            reusableBlocks={reusableBlocks}
            onSaveReusableBlock={onSaveReusableBlock}
            onDeleteReusableBlock={onDeleteReusableBlock}
            width={palettePanelWidth}
            onWidthChange={setPalettePanelWidth}
            onCollapse={() => setPaletteCollapsed(true)}
          />
        )
      ) : null}
      <main className="layoutpdf-document-area">
        <DocumentCanvas
          state={state}
          document={document}
          dispatch={dispatch}
          mode={state.mode}
          hasClipboard={hasClipboard}
          onCopy={onCopy}
          onPaste={onPaste}
        />
      </main>
      {state.mode === 'designer' && gridElement ? (
        <GridEditorWorkspace
          name={gridElement.name}
          props={gridElement.props}
          disabled={gridElement.locked}
          onClose={closeGridEditor}
          onChange={(props, historyGroup) => dispatch({
            type: 'element/update',
            ids: [gridElement.id],
            patch: { path: 'props', value: props as unknown as JsonValue },
            historyGroup,
          })}
          onEndHistoryGroup={group => dispatch({ type: 'history/endGroup', group })}
          onCancelHistoryGroup={group => dispatch({ type: 'history/cancelGroup', group })}
        />
      ) : null}
      {state.mode === 'designer' ? (
        gridElement ? null : propertiesCollapsed ? (
          <aside className="layoutpdf-properties-collapsed">
            <IconButton
              size="sm"
              title={t('property.panel.expand')}
              aria-label={t('property.panel.expand')}
              onClick={() => setPropertiesCollapsed(false)}
            >
              <Icon name="chevron-left" />
            </IconButton>
          </aside>
        ) : (
          <ElementPropertyPanel
            state={state}
            dispatch={dispatch}
            plugins={plugins}
            width={propertiesPanelWidth}
            onWidthChange={setPropertiesPanelWidth}
            onCollapse={() => setPropertiesCollapsed(true)}
          />
        )
      ) : null}
    </div>
    </GridEditorContext.Provider>
  );
}
