import { useEffect, useRef, useState } from 'react';
import type { Dispatch, PointerEvent as ReactPointerEvent } from 'react';
import type { ElementBox, TemplateElement } from '@/engine/core/document.js';
import type { RenderPage } from '@/engine/renderTree/model.js';
import { cssPxToMm, mmToCssPx } from '@/engine/utils/units.js';
import IconButton from '@/ui/button/IconButton.js';
import Icon from '@/ui/icon/Icon.js';
import { ContextMenu, type ContextMenuItem } from '@/ui/contextMenu/ContextMenu.js';
import { t } from '@/i18n/index.js';
import {
  buildElementCommandDescriptors,
  commandItems,
} from '@/editor/commands/elementCommands.js';
import {
  createMarqueeBox,
  mergeSelectionIds,
  moveBoxes,
  resizeBox,
  selectElementIdsInBox,
  snapBoxesToGuides,
  type DesignerPoint,
  type ResizeHandle,
  type SnapGuides,
} from '@/editor/layout/designerGeometry.js';
import type { DocumentAction, DocumentState } from '@/editor/state/documentState.js';
import { expandElementIdsToGroups } from '@/engine/core/elementGroups.js';

interface DesignerChromeProps {
  page: RenderPage;
  state: DocumentState;
  dispatch: Dispatch<DocumentAction>;
  zoom: number;
  showGrid: boolean;
  snapEnabled: boolean;
  hasClipboard: boolean;
  onCopy(ids: string[]): void;
  onPaste(): void;
  onActivatePage?: (sourcePageId: string) => void;
  onDoubleClickElement?: (elementId: string) => void;
}

type Interaction =
  | {
      kind: 'move';
      start: { x: number; y: number };
      boxes: Record<string, ElementBox>;
      pageSize: { width: number; height: number };
      duplicate: boolean;
    }
  | {
      kind: 'resize';
      start: { x: number; y: number };
      id: string;
      box: ElementBox;
      pageSize: { width: number; height: number };
      handle: ResizeHandle;
    }
  | {
      kind: 'rotate';
      id: string;
      center: { x: number; y: number };
      startAngle: number;
      rotate: number;
    }
  | {
      kind: 'marquee';
      startClient: DesignerPoint;
      startPoint: DesignerPoint;
      pageSize: { width: number; height: number };
      initialIds: string[];
      additive: boolean;
    };

function showsPlaceholder(element: TemplateElement<object>): boolean {
  if (element.type === 'summary') {
    const items = (element.props as Record<string, unknown>).items;
    return Array.isArray(items) && items.length === 0;
  }
  if (!['text', 'number', 'currency', 'date', 'image'].includes(element.type)) return false;
  if (element.value === null || element.value === '') return true;
  if (Array.isArray(element.value)) return element.value.length === 0;
  if (element.type === 'image' && typeof element.value === 'object') {
    const image = element.value as Record<string, unknown>;
    return !image.assetId && !image.dataUrl;
  }
  return false;
}

function placeholderText(element: TemplateElement<object>): string {
  return element.type === 'summary'
    ? t('property.summary.placeholder')
    : element.name;
}

export default function DesignerChrome({
  page,
  state,
  dispatch,
  zoom,
  showGrid,
  snapEnabled,
  hasClipboard,
  onCopy,
  onPaste,
  onActivatePage,
  onDoubleClickElement,
}: DesignerChromeProps) {
  const sourcePage = state.templateFile.template.pages.find(item => item.id === page.sourcePageId);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [previewBoxes, setPreviewBoxes] = useState<Record<string, ElementBox>>({});
  const [previewRotations, setPreviewRotations] = useState<Record<string, number>>({});
  const [snapGuides, setSnapGuides] = useState<SnapGuides>({});
  const [marqueeBox, setMarqueeBox] = useState<ElementBox | null>(null);
  const previewBoxesRef = useRef(previewBoxes);
  const previewRotationsRef = useRef(previewRotations);
  const marqueeBoxRef = useRef(marqueeBox);
  const changedRef = useRef(false);
  previewBoxesRef.current = previewBoxes;
  previewRotationsRef.current = previewRotations;
  marqueeBoxRef.current = marqueeBox;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetElementId?: string } | null>(null);

  useEffect(() => {
    if (!interaction) return;
    const move = (event: PointerEvent) => {
      if (interaction.kind === 'marquee') {
        const delta = {
          x: event.clientX - interaction.startClient.x,
          y: event.clientY - interaction.startClient.y,
        };
        if (!changedRef.current && Math.hypot(delta.x, delta.y) < 3) return;
        changedRef.current = true;
        const box = createMarqueeBox(interaction.startPoint, {
          x: interaction.startPoint.x + cssPxToMm(delta.x, zoom),
          y: interaction.startPoint.y + cssPxToMm(delta.y, zoom),
        }, interaction.pageSize);
        marqueeBoxRef.current = box;
        setMarqueeBox(box);
      } else if (interaction.kind === 'move') {
        changedRef.current = true;
        const moved = moveBoxes(interaction.boxes, {
          x: cssPxToMm(event.clientX - interaction.start.x, zoom),
          y: cssPxToMm(event.clientY - interaction.start.y, zoom),
        }, interaction.pageSize, snapEnabled ? 0.5 : 0);
        if (snapEnabled && sourcePage) {
          const movingIds = new Set(Object.keys(interaction.boxes));
          const snapped = snapBoxesToGuides(
            moved,
            sourcePage.elements.filter(element => !movingIds.has(element.id)).map(element => element.box),
            sourcePage,
          );
          setPreviewBoxes(snapped.boxes);
          setSnapGuides(snapped.guides);
        } else {
          setPreviewBoxes(moved);
          setSnapGuides({});
        }
      } else if (interaction.kind === 'resize') {
        changedRef.current = true;
        setPreviewBoxes({
          [interaction.id]: resizeBox(interaction.box, interaction.handle, {
            x: cssPxToMm(event.clientX - interaction.start.x, zoom),
            y: cssPxToMm(event.clientY - interaction.start.y, zoom),
          }, interaction.pageSize, snapEnabled ? 0.5 : 0),
        });
      } else {
        changedRef.current = true;
        const angle = Math.atan2(
          event.clientY - interaction.center.y,
          event.clientX - interaction.center.x,
        ) * 180 / Math.PI;
        const step = event.shiftKey ? 15 : 1;
        const rotate = Math.round((interaction.rotate + angle - interaction.startAngle) / step) * step;
        setPreviewRotations({ [interaction.id]: Math.max(-180, Math.min(180, rotate)) });
      }
    };
    const resetInteraction = () => {
      setInteraction(null);
      setPreviewBoxes({});
      setPreviewRotations({});
      setSnapGuides({});
      setMarqueeBox(null);
      marqueeBoxRef.current = null;
      changedRef.current = false;
    };
    const end = () => {
      if (interaction.kind === 'marquee') {
        const box = marqueeBoxRef.current;
        if (changedRef.current && box && sourcePage) {
          const selected = selectElementIdsInBox(sourcePage.elements, box);
          dispatch({
            type: 'selection/set',
            ids: interaction.additive
              ? mergeSelectionIds(interaction.initialIds, selected)
              : selected,
          });
        } else if (!interaction.additive) {
          dispatch({ type: 'selection/set', ids: [] });
        }
      } else if (changedRef.current && interaction.kind === 'rotate') {
        const rotate = previewRotationsRef.current[interaction.id];
        if (rotate !== undefined) {
          dispatch({
            type: 'element/update',
            ids: [interaction.id],
            patch: { path: 'rotate', value: rotate },
          });
        }
      } else if (changedRef.current && Object.keys(previewBoxesRef.current).length > 0) {
        if (interaction.kind === 'move' && interaction.duplicate) {
          dispatch({
            type: 'element/duplicateToBoxes',
            pageId: page.sourcePageId,
            boxes: previewBoxesRef.current,
          });
        } else {
          dispatch({ type: 'element/updateBoxes', boxes: previewBoxesRef.current });
        }
      }
      resetInteraction();
    };
    const cancel = () => resetInteraction();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [dispatch, interaction, page.sourcePageId, snapEnabled, sourcePage, zoom]);

  if (!sourcePage || page.continuationIndex !== 0) return null;

  const startMove = (element: TemplateElement<object>, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onActivatePage?.(page.sourcePageId);
    const selected = state.selectedElementIds.includes(element.id)
      ? state.selectedElementIds
      : expandElementIdsToGroups(sourcePage, [element.id]);
    if (!state.selectedElementIds.includes(element.id)) {
      dispatch({ type: 'selection/set', ids: selected });
    }
    if (element.locked) return;
    const boxes = Object.fromEntries(
      sourcePage.elements
        .filter(item => selected.includes(item.id) && !item.locked)
        .map(item => [item.id, { ...item.box }]),
    );
    setPreviewBoxes(boxes);
    changedRef.current = false;
    setInteraction({
      kind: 'move',
      start: { x: event.clientX, y: event.clientY },
      boxes,
      pageSize: { ...sourcePage.size },
      duplicate: event.altKey,
    });
  };

  const handleContextMenu = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    onActivatePage?.(page.sourcePageId);
    const targetElementId = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>('.layoutpdf-element-chrome')?.dataset.editorElementId
      : undefined;
    if (targetElementId && !state.selectedElementIds.includes(targetElementId)) {
      dispatch({ type: 'selection/set', ids: [targetElementId] });
    }
    setContextMenu({ x: event.clientX, y: event.clientY, targetElementId });
  };

  const buildContextMenuItems = (targetElementId?: string): ContextMenuItem[] => {
    if (!targetElementId) {
      return [
        { id: 'paste', label: t('editor.chrome.paste'), shortcut: '⌘V', disabled: !hasClipboard, onClick: onPaste },
        { id: 'select-all', label: t('editor.chrome.selectAll'), shortcut: '⌘A', onClick: () => dispatch({ type: 'selection/set', ids: sourcePage.elements.map(e => e.id) }) },
      ];
    }
    return commandItems(buildElementCommandDescriptors({
      page: sourcePage,
      selectedIds: state.selectedElementIds,
      targetElementId,
      dispatch,
      hasClipboard,
      onCopy,
      onPaste,
    }), [
      'copy',
      'paste',
      'duplicate',
      'delete',
      'group',
      'ungroup',
      'divider-edit',
      'bring-front',
      'send-back',
      'bring-forward',
      'send-backward',
      'divider-state',
      'lock',
      'hide',
    ]);
  };

  const startMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    onActivatePage?.(page.sourcePageId);
    if (event.target !== event.currentTarget || event.button !== 0) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pageElementIds = new Set(sourcePage.elements.map(element => element.id));
    changedRef.current = false;
    marqueeBoxRef.current = null;
    setMarqueeBox(null);
    setInteraction({
      kind: 'marquee',
      startClient: { x: event.clientX, y: event.clientY },
      startPoint: {
        x: cssPxToMm(event.clientX - rect.left, zoom),
        y: cssPxToMm(event.clientY - rect.top, zoom),
      },
      pageSize: { ...sourcePage.size },
      initialIds: state.selectedElementIds.filter(id => pageElementIds.has(id)),
      additive: event.shiftKey,
    });
  };
  const selectedIds = new Set(state.selectedElementIds);
  const selectedGroupIds = new Set(sourcePage.elements
    .filter(element => selectedIds.has(element.id) && element.groupId)
    .map(element => element.groupId!));
  const selectedGroupOutlines = [...selectedGroupIds].flatMap(groupId => {
    const members = sourcePage.elements.filter(element => element.groupId === groupId);
    if (members.length < 2 || !members.every(element => selectedIds.has(element.id))) return [];
    const boxes = members.map(element => previewBoxes[element.id] ?? element.box);
    const left = Math.min(...boxes.map(box => box.x));
    const top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.width));
    const bottom = Math.max(...boxes.map(box => box.y + box.height));
    return [{
      id: groupId,
      locked: members.every(element => element.locked),
      box: { x: left, y: top, width: right - left, height: bottom - top },
    }];
  });

  return (
    <div className="layoutpdf-designer-chrome" onPointerDown={startMarquee} onContextMenu={handleContextMenu}>
      {showGrid ? (
        <>
          <div
            className="layoutpdf-designer-grid"
            style={{
              backgroundSize: `${mmToCssPx(5, zoom)}px ${mmToCssPx(5, zoom)}px`,
            }}
          />
          <div className="layoutpdf-ruler layoutpdf-ruler-horizontal">
            {Array.from({ length: Math.floor(sourcePage.size.width / 10) + 1 }, (_, index) => (
              <span key={index} style={{ left: mmToCssPx(index * 10, zoom) }}>{index * 10}</span>
            ))}
          </div>
          <div className="layoutpdf-ruler layoutpdf-ruler-vertical">
            {Array.from({ length: Math.floor(sourcePage.size.height / 10) + 1 }, (_, index) => (
              <span key={index} style={{ top: mmToCssPx(index * 10, zoom) }}>{index * 10}</span>
            ))}
          </div>
        </>
      ) : null}
      <div
        className="layoutpdf-page-padding-guide"
        style={{
          top: mmToCssPx(sourcePage.padding[0], zoom),
          right: mmToCssPx(sourcePage.padding[1], zoom),
          bottom: mmToCssPx(sourcePage.padding[2], zoom),
          left: mmToCssPx(sourcePage.padding[3], zoom),
        }}
      />
      {snapGuides.x !== undefined ? (
        <div className="layoutpdf-snap-guide vertical" style={{ left: mmToCssPx(snapGuides.x, zoom) }} />
      ) : null}
      {snapGuides.y !== undefined ? (
        <div className="layoutpdf-snap-guide horizontal" style={{ top: mmToCssPx(snapGuides.y, zoom) }} />
      ) : null}
      {marqueeBox ? (
        <div
          className="layoutpdf-selection-marquee"
          aria-hidden="true"
          style={{
            left: mmToCssPx(marqueeBox.x, zoom),
            top: mmToCssPx(marqueeBox.y, zoom),
            width: mmToCssPx(marqueeBox.width, zoom),
            height: mmToCssPx(marqueeBox.height, zoom),
          }}
        />
      ) : null}
      {selectedGroupOutlines.map(group => (
        <div
          key={group.id}
          className={`layoutpdf-element-group-outline${group.locked ? ' locked' : ''}`}
          data-editor-group-id={group.id}
          aria-hidden="true"
          style={{
            left: mmToCssPx(group.box.x, zoom),
            top: mmToCssPx(group.box.y, zoom),
            width: mmToCssPx(group.box.width, zoom),
            height: mmToCssPx(group.box.height, zoom),
          }}
        />
      ))}
      {sourcePage.elements.map(element => {
        const box = previewBoxes[element.id] ?? element.box;
        const rotate = previewRotations[element.id] ?? element.rotate;
        const selected = state.selectedElementIds.includes(element.id);
        const placeholder = showsPlaceholder(element);
        const actualHeight = mmToCssPx(box.height, zoom);
        const hitHeight = element.type === 'line' ? Math.max(12, actualHeight) : actualHeight;
        return (
          <div
            key={element.id}
            className={`layoutpdf-element-chrome${selected ? ' selected' : ''}${placeholder ? ' empty' : ''}${element.locked ? ' locked' : ''}${element.hidden ? ' hidden' : ''}${interaction?.kind === 'move' && interaction.duplicate && previewBoxes[element.id] ? ' duplicating' : ''}`}
            data-editor-element-id={element.id}
            data-element-type={element.type}
            style={{
              left: mmToCssPx(box.x, zoom),
              top: mmToCssPx(box.y, zoom) - (hitHeight - actualHeight) / 2,
              width: mmToCssPx(box.width, zoom),
              height: hitHeight,
              transform: rotate ? `rotate(${rotate}deg)` : undefined,
            }}
            onPointerDown={event => startMove(element, event)}
            onDoubleClick={event => {
              event.stopPropagation();
              onDoubleClickElement?.(element.id);
            }}
          >
            {placeholder ? (
              <span className="layoutpdf-element-placeholder">{placeholderText(element)}</span>
            ) : null}
            {selected && !element.locked && state.selectedElementIds.length === 1 ? (
              <>
                {(['se', 'sw', 'ne', 'nw', 'e', 'w', 'n', 's'] as const).map(h => (
                  <button
                    key={h}
                    type="button"
                    className={`layoutpdf-resize-handle layoutpdf-resize-handle-${h}`}
                    title={t('editor.chrome.resize')}
                    aria-label={t('editor.chrome.resize')}
                    onPointerDown={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      setPreviewBoxes({ [element.id]: { ...element.box } });
                      changedRef.current = false;
                      setInteraction({
                        kind: 'resize',
                        start: { x: event.clientX, y: event.clientY },
                        id: element.id,
                        box: { ...element.box },
                        pageSize: { ...sourcePage.size },
                        handle: h,
                      });
                    }}
                  />
                ))}
                <button
                  type="button"
                  className="layoutpdf-rotate-handle"
                  title={t('editor.chrome.rotate')}
                  aria-label={t('editor.chrome.rotate')}
                  onPointerDown={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const pageElement = event.currentTarget.closest('[data-render-page-id]');
                    if (!pageElement) return;
                    const rect = pageElement.getBoundingClientRect();
                    const center = {
                      x: rect.left + mmToCssPx(element.box.x + element.box.width / 2, zoom),
                      y: rect.top + mmToCssPx(element.box.y + element.box.height / 2, zoom),
                    };
                    setPreviewRotations({ [element.id]: element.rotate });
                    changedRef.current = false;
                    setInteraction({
                      kind: 'rotate',
                      id: element.id,
                      center,
                      startAngle: Math.atan2(event.clientY - center.y, event.clientX - center.x) * 180 / Math.PI,
                      rotate: element.rotate,
                    });
                  }}
                />
                <IconButton
                  variant="danger"
                  size="sm"
                  className="layoutpdf-delete-handle"
                  title={t('editor.chrome.delete')}
                  aria-label={t('editor.chrome.delete')}
                  onPointerDown={event => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={() => dispatch({ type: 'element/delete', ids: [element.id] })}
                >
                  <Icon name="trash" />
                </IconButton>
              </>
            ) : null}
          </div>
        );
      })}

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextMenuItems(contextMenu.targetElementId)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
