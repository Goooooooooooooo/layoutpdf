import { useState, type Dispatch, type PointerEvent as ReactPointerEvent } from 'react';
import { createId } from '@/engine/core/document.js';
import type { PluginRegistry } from '@/engine/core/plugin.js';
import { pluginRegistry as defaultPluginRegistry } from '@/plugins/index.js';
import type { ElementPreset } from '@/presets/types.js';
import type { DocumentAction, DocumentState } from '@/editor/state/documentState.js';
import { findAvailablePosition } from '@/editor/layout/palettePlacement.js';
import { resolveMessageLabel, t } from '@/i18n/index.js';
import { ConfirmDialog, PromptDialog } from '@/ui/dialog/Dialog.js';
import { createReusableBlock, instantiateReusableBlock } from '@/presets/reusableBlock.js';
import type { ReusableBlock } from '@/storage/reusableBlockRepository.js';
import IconButton from '@/ui/button/IconButton.js';
import Icon from '@/ui/icon/Icon.js';
import { useToast } from '@/ui/toast/useToast.js';
import { toggleElementGroupSelection } from '@/engine/core/elementGroups.js';

interface ElementPaletteProps {
  state: DocumentState;
  dispatch: Dispatch<DocumentAction>;
  plugins?: PluginRegistry;
  presets?: ElementPreset[];
  reusableBlocks?: ReusableBlock[];
  onSaveReusableBlock?(block: ReusableBlock): Promise<void>;
  onDeleteReusableBlock?(id: string): Promise<void>;
  width?: number;
  onWidthChange?(width: number): void;
  onCollapse?(): void;
}

const CATEGORY_LABEL_KEYS = {
  basic: 'plugin.category.basic',
  data: 'plugin.category.data',
  layout: 'plugin.category.layout',
  business: 'plugin.category.business',
} as const;

export default function ElementPalette({
  state,
  dispatch,
  plugins = defaultPluginRegistry,
  presets = [],
  reusableBlocks = [],
  onSaveReusableBlock = async () => undefined,
  onDeleteReusableBlock = async () => undefined,
  width,
  onWidthChange,
  onCollapse,
}: ElementPaletteProps) {
  const toast = useToast();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [blockName, setBlockName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ReusableBlock | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [blockError, setBlockError] = useState('');
  const page = state.templateFile.template.pages.find(item => item.id === state.activePageId)
    ?? state.templateFile.template.pages[0];
  const selectedElements = page.elements.filter(element => state.selectedElementIds.includes(element.id));

  const saveBlock = async () => {
    if (!blockName.trim() || selectedElements.length === 0) return;
    setIsWorking(true);
    setBlockError('');
    try {
      await onSaveReusableBlock(createReusableBlock({
        name: blockName,
        elements: selectedElements,
        assets: state.templateFile.assets,
      }));
      setShowSaveDialog(false);
      setBlockName('');
    } catch (error) {
      setBlockError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  };

  const panelStyle = width !== undefined ? { width } : undefined;
  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onWidthChange || width === undefined) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const onMove = (moveEvent: PointerEvent) => {
      onWidthChange(startWidth + (moveEvent.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const resizeHandle = onWidthChange ? (
    <div
      className="layoutpdf-palette-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('editor.palette.resizeAria')}
      onPointerDown={handleResizeStart}
    />
  ) : null;
  return (
    <aside className="layoutpdf-palette" style={panelStyle}>
      {resizeHandle}
      <div className="layoutpdf-palette-scroll">
      <div className="layoutpdf-panel-title">
        {t('editor.palette.title')}
        {onCollapse ? (
          <IconButton
            size="sm"
            title={t('editor.palette.collapse')}
            aria-label={t('editor.palette.collapse')}
            onClick={onCollapse}
          >
            <Icon name="chevron-left" />
          </IconButton>
        ) : null}
      </div>
      <details className="layoutpdf-palette-section" open>
        <summary className="layoutpdf-section-label">{t('editor.palette.presets')}</summary>
        <div className="layoutpdf-palette-grid">
          {presets.map(preset => {
            const alreadyAdded = page.elements.some(element => element.presetId === preset.id);
            const presetLabel = resolveMessageLabel(preset);
            return (
              <button
                type="button"
                key={preset.id}
                className="layoutpdf-palette-tile"
                disabled={alreadyAdded}
                title={alreadyAdded
                  ? t('editor.palette.alreadyAdded')
                  : t('editor.palette.addPreset', { label: presetLabel })}
                onClick={() => dispatch({
                  type: 'elements/add',
                  pageId: page.id,
                  dedupeKey: preset.id,
                  elements: preset.createElements({
                    pageId: page.id,
                    origin: { x: page.padding[3], y: page.padding[0] },
                    registry: plugins,
                    createId,
                  }),
                })}
              >
                <span className="layoutpdf-palette-symbol" aria-hidden="true">{presetLabel.slice(0, 1)}</span>
                <span>{alreadyAdded
                  ? t('editor.palette.presetAdded', { label: presetLabel })
                  : presetLabel}</span>
              </button>
            );
          })}
        </div>
      </details>
      {(Object.keys(CATEGORY_LABEL_KEYS) as Array<keyof typeof CATEGORY_LABEL_KEYS>).map(category => {
        const categoryPlugins = plugins.list().filter(plugin => plugin.metadata.category === category);
        if (categoryPlugins.length === 0) return null;
        return (
          <details key={category} className="layoutpdf-palette-section" open>
            <summary className="layoutpdf-section-label">{t(CATEGORY_LABEL_KEYS[category])}</summary>
            <div className="layoutpdf-palette-grid">
              {categoryPlugins.map(plugin => {
                const pluginLabel = resolveMessageLabel(plugin.metadata);
                return (
                  <button
                    type="button"
                    key={plugin.metadata.type}
                    className="layoutpdf-palette-tile"
                    onClick={() => {
                      const element = plugin.createDefaultElement({
                        id: createId('el'),
                        position: { x: page.padding[3], y: page.padding[0] },
                      });
                      element.box = { ...element.box, ...findAvailablePosition(page, element.box) };
                      dispatch({ type: 'element/add', pageId: page.id, element });
                    }}
                  >
                    <span className="layoutpdf-palette-symbol" aria-hidden="true">
                      {pluginLabel.slice(0, 1)}
                    </span>
                    <span>{pluginLabel}</span>
                  </button>
                );
              })}
            </div>
          </details>
        );
      })}
      <details className="layoutpdf-palette-section" open>
        <summary className="layoutpdf-section-label">{t('editor.palette.reusableBlocks')}</summary>
        <div className="layoutpdf-palette-grid">
          <button
            type="button"
            className="layoutpdf-palette-tile"
            disabled={selectedElements.length === 0}
            onClick={() => {
              setBlockError('');
              setShowSaveDialog(true);
            }}
          >
            <span className="layoutpdf-palette-symbol" aria-hidden="true">＋</span>
            <span>{t('editor.palette.saveSelection')}</span>
          </button>
          {reusableBlocks.map(block => (
            <div key={block.id} className="layoutpdf-palette-tile" style={{ position: 'relative' }}>
              <button
                type="button"
                style={{ display: 'contents', color: 'inherit', textAlign: 'inherit' }}
                onClick={() => {
                  const {
                    removedOutputReferenceCount,
                    ...instance
                  } = instantiateReusableBlock(
                    block,
                    findAvailablePosition(page, {
                      width: Math.max(...block.elements.map(element => element.box.x + element.box.width)),
                      height: Math.max(...block.elements.map(element => element.box.y + element.box.height)),
                    }),
                    createId,
                  );
                  dispatch({ type: 'elements/add', pageId: page.id, ...instance });
                  if (removedOutputReferenceCount > 0) {
                    toast.warning(
                      t('editor.clipboard.summaryReferencesRemoved'),
                      t('editor.clipboard.summaryReferencesRemovedDetail', {
                        count: removedOutputReferenceCount,
                      }),
                    );
                  }
                }}
              >
                <span className="layoutpdf-palette-symbol" aria-hidden="true">{block.name.slice(0, 1)}</span>
                <span>{block.name}</span>
              </button>
              <IconButton
                size="sm"
                className="layoutpdf-palette-tile-delete"
                title={t('editor.palette.deleteReusableBlock', { name: block.name })}
                aria-label={t('editor.palette.deleteReusableBlock', { name: block.name })}
                onClick={() => setDeleteTarget(block)}
              >
                <Icon name="x" size={12} />
              </IconButton>
            </div>
          ))}
        </div>
        {reusableBlocks.length === 0 ? (
          <div className="layoutpdf-layer-empty">{t('editor.palette.noReusableBlocks')}</div>
        ) : null}
        {blockError ? <div className="layoutpdf-field-error" role="alert">{blockError}</div> : null}
      </details>
      <section className="layoutpdf-palette-section layoutpdf-layer-section">
        <div className="layoutpdf-section-label">
          {t('editor.palette.addedControls', { count: page.elements.length })}
        </div>
        {page.elements.length === 0 ? (
          <div className="layoutpdf-layer-empty">{t('editor.palette.emptyPage')}</div>
        ) : [...page.elements].reverse().map((element, reverseIndex) => {
          const plugin = plugins.get(element.type);
          const pluginLabel = plugin ? resolveMessageLabel(plugin.metadata) : undefined;
          const selected = state.selectedElementIds.includes(element.id);
          const layerIndex = page.elements.length - reverseIndex;
          return (
            <button
              type="button"
              key={element.id}
              className={`layoutpdf-layer-item${selected ? ' selected' : ''}`}
              title={`${element.name} (${pluginLabel ?? element.type})`}
              onClick={event => dispatch({
                type: 'selection/set',
                ids: event.metaKey || event.ctrlKey
                  ? toggleElementGroupSelection(page, state.selectedElementIds, element.id)
                  : [element.id],
              })}
            >
              <span className="layoutpdf-layer-index">{layerIndex}</span>
              <span className="layoutpdf-layer-name">{element.name || pluginLabel || element.type}</span>
              {element.hidden || element.locked ? (
                <span className="layoutpdf-layer-state">
                  {[
                    element.hidden ? t('editor.palette.stateHidden') : '',
                    element.locked ? t('editor.palette.stateLocked') : '',
                  ].filter(Boolean).join('/')}
                </span>
              ) : null}
            </button>
          );
        })}
      </section>
      </div>
      <PromptDialog
        open={showSaveDialog}
        title={t('editor.palette.saveBlockTitle')}
        label={t('editor.palette.blockName')}
        value={blockName}
        isWorking={isWorking}
        onValueChange={setBlockName}
        onConfirm={() => void saveBlock()}
        onClose={() => setShowSaveDialog(false)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('editor.palette.deleteBlockTitle')}
        description={deleteTarget ? t('editor.palette.deleteBlockDescription', { name: deleteTarget.name }) : ''}
        confirmLabel={t('common.delete')}
        isWorking={isWorking}
        onConfirm={() => {
          if (!deleteTarget) return;
          setIsWorking(true);
          void onDeleteReusableBlock(deleteTarget.id)
            .then(() => setDeleteTarget(null))
            .catch(error => setBlockError(error instanceof Error ? error.message : String(error)))
            .finally(() => setIsWorking(false));
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </aside>
  );
}
