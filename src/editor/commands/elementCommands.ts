import type { TemplatePage } from '@/engine/core/document.js';
import type { ContextMenuItem } from '@/ui/contextMenu/ContextMenu.js';
import { t } from '@/i18n/index.js';
import type { DocumentAction } from '@/editor/state/documentState.js';

export type ElementCommandId =
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'group'
  | 'ungroup'
  | 'bring-front'
  | 'send-back'
  | 'bring-forward'
  | 'send-backward'
  | 'lock'
  | 'hide';

interface BuildElementCommandsOptions {
  page?: TemplatePage;
  selectedIds: string[];
  targetElementId?: string;
  dispatch(action: DocumentAction): void;
  hasClipboard?: boolean;
  onCopy?(ids: string[]): void;
  onPaste?(): void;
}

/**
 * Both the canvas menu and Inspector Header consume these descriptors.
 * Resolving an unselected context-menu target here prevents commands from
 * accidentally acting on the selection captured before the right click.
 */
export function buildElementCommandDescriptors({
  page,
  selectedIds,
  targetElementId,
  dispatch,
  hasClipboard = false,
  onCopy,
  onPaste,
}: BuildElementCommandsOptions): Record<ElementCommandId, ContextMenuItem> {
  const pageIds = new Set(page?.elements.map(element => element.id) ?? []);
  const currentIds = [...new Set(selectedIds)].filter(id => pageIds.has(id));
  const effectiveIds = targetElementId && !currentIds.includes(targetElementId)
    ? [targetElementId]
    : currentIds;
  const elements = page?.elements.filter(element => effectiveIds.includes(element.id)) ?? [];
  const unlockedIds = elements.filter(element => !element.locked).map(element => element.id);
  const allLocked = elements.length > 0 && elements.every(element => element.locked);
  const anyLocked = elements.some(element => element.locked);
  const allHidden = elements.length > 0 && elements.every(element => element.hidden);
  const groupIds = new Set(elements.flatMap(element => element.groupId ? [element.groupId] : []));
  const alreadyOneGroup = elements.length > 1
    && groupIds.size === 1
    && elements.every(element => element.groupId);
  const singleIndex = elements.length === 1
    ? page?.elements.findIndex(element => element.id === elements[0].id) ?? -1
    : -1;
  const dispatchReorder = (toIndex: number) => {
    if (!page || effectiveIds.length === 0) return;
    dispatch({ type: 'element/reorder', pageId: page.id, ids: effectiveIds, toIndex });
  };

  return {
    copy: {
      id: 'copy',
      label: t('editor.chrome.copy'),
      shortcut: '⌘C',
      disabled: effectiveIds.length === 0 || !onCopy,
      onClick: () => onCopy?.(effectiveIds),
    },
    paste: {
      id: 'paste',
      label: t('editor.chrome.paste'),
      shortcut: '⌘V',
      disabled: !hasClipboard || !onPaste,
      onClick: onPaste,
    },
    duplicate: {
      id: 'duplicate',
      label: t('editor.chrome.duplicate'),
      shortcut: '⌘D',
      disabled: unlockedIds.length === 0,
      onClick: () => dispatch({ type: 'element/duplicate', ids: effectiveIds }),
    },
    delete: {
      id: 'delete',
      label: t('editor.chrome.delete'),
      shortcut: '⌫',
      danger: true,
      disabled: unlockedIds.length === 0,
      onClick: () => dispatch({ type: 'element/delete', ids: effectiveIds }),
    },
    group: {
      id: 'group',
      label: t('editor.chrome.group'),
      shortcut: '⌘G',
      disabled: elements.length < 2 || anyLocked || alreadyOneGroup,
      onClick: () => {
        if (page) dispatch({ type: 'element/group', pageId: page.id, ids: effectiveIds });
      },
    },
    ungroup: {
      id: 'ungroup',
      label: t('editor.chrome.ungroup'),
      shortcut: '⇧⌘G',
      disabled: groupIds.size === 0 || anyLocked,
      onClick: () => {
        if (page) dispatch({ type: 'element/ungroup', pageId: page.id, ids: effectiveIds });
      },
    },
    'bring-front': {
      id: 'bring-front',
      label: t('editor.chrome.bringToFront'),
      disabled: effectiveIds.length === 0,
      onClick: () => dispatchReorder(page?.elements.length ?? 0),
    },
    'send-back': {
      id: 'send-back',
      label: t('editor.chrome.sendToBack'),
      disabled: effectiveIds.length === 0,
      onClick: () => dispatchReorder(0),
    },
    'bring-forward': {
      id: 'bring-forward',
      label: t('editor.chrome.bringForward'),
      disabled: singleIndex < 0 || singleIndex >= (page?.elements.length ?? 0) - 1,
      onClick: () => dispatchReorder(singleIndex + 1),
    },
    'send-backward': {
      id: 'send-backward',
      label: t('editor.chrome.sendBackward'),
      disabled: singleIndex <= 0,
      onClick: () => dispatchReorder(singleIndex - 1),
    },
    lock: {
      id: 'lock',
      label: allLocked ? t('editor.chrome.unlock') : t('editor.chrome.lock'),
      disabled: elements.length === 0,
      onClick: () => dispatch({
        type: 'element/update',
        ids: effectiveIds,
        patch: { path: 'locked', value: !allLocked },
      }),
    },
    hide: {
      id: 'hide',
      label: allHidden ? t('editor.chrome.show') : t('editor.chrome.hide'),
      disabled: elements.length === 0 || anyLocked,
      onClick: () => dispatch({
        type: 'element/update',
        ids: effectiveIds,
        patch: { path: 'hidden', value: !allHidden },
      }),
    },
  };
}

export function commandItems(
  descriptors: Record<ElementCommandId, ContextMenuItem>,
  ids: Array<ElementCommandId | `divider-${string}`>,
): ContextMenuItem[] {
  return ids.map(id => id.startsWith('divider-')
    ? { id, label: '', divider: true }
    : descriptors[id as ElementCommandId]);
}
