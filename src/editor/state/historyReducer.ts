import type { LayoutPDFTemplate } from '@/engine/core/document.js';

import type { DocumentAction, DocumentState, HistoryState } from './documentState.js';

function existingSelection(template: LayoutPDFTemplate, ids: string[]): string[] {
  const existing = new Set(template.pages.flatMap(page => page.elements.map(element => element.id)));
  return [...new Set(ids)].filter(id => existing.has(id));
}

function collectReferencedAssetIds(template: LayoutPDFTemplate): Set<string> {
  const ids = new Set<string>();
  for (const page of template.pages) {
    for (const element of page.elements) {
      if (element.type === 'image'
        && element.value
        && typeof element.value === 'object'
        && !Array.isArray(element.value)) {
        const v = element.value as Record<string, unknown>;
        if (v.source === 'asset' && typeof v.assetId === 'string') {
          ids.add(v.assetId);
        }
      }
    }
  }
  return ids;
}

function gcAssets(templateFile: { template: LayoutPDFTemplate; assets: Record<string, unknown> }): void {
  const referenced = collectReferencedAssetIds(templateFile.template);
  for (const key of Object.keys(templateFile.assets)) {
    if (!referenced.has(key)) {
      delete templateFile.assets[key];
    }
  }
}

function updateTemplateFromHistory(
  state: DocumentState,
  history: HistoryState,
): DocumentState {
  const activePageId = history.present.pages.some(page => page.id === state.activePageId)
    ? state.activePageId
    : history.present.pages[0].id;
  const templateFile = { ...state.templateFile, template: history.present };
  gcAssets(templateFile);
  return {
    ...state,
    templateFile,
    activePageId,
    selectedElementIds: existingSelection(history.present, state.selectedElementIds),
    dirty: true,
    history: { ...history, lastCommitTimestamp: Date.now() },
  };
}

export function historyReducer(
  state: DocumentState,
  action: DocumentAction,
): DocumentState {
  switch (action.type) {
    case 'mode/set':
      return {
        ...state,
        mode: action.mode,
        history: state.history.activeGroup
          ? { ...state.history, activeGroup: undefined }
          : state.history,
      };
    case 'selection/set':
    case 'page/activate':
      return state.history.activeGroup
        ? { ...state, history: { ...state.history, activeGroup: undefined } }
        : state;
    case 'history/endGroup':
      return state.history.activeGroup?.id === action.group
        ? { ...state, history: { ...state.history, activeGroup: undefined } }
        : state;
    case 'history/cancelGroup': {
      const group = state.history.activeGroup;
      if (!group || group.id !== action.group) return state;
      const activePageId = group.before.pages.some(page => page.id === state.activePageId)
        ? state.activePageId
        : group.before.pages[0].id;
      return {
        ...state,
        templateFile: { ...state.templateFile, template: group.before },
        activePageId,
        selectedElementIds: existingSelection(group.before, state.selectedElementIds),
        // Persist the restored snapshot if auto-save observed an intermediate preview.
        dirty: true,
        history: {
          past: group.past,
          present: group.before,
          future: group.future,
          lastCommitTimestamp: 0,
        },
      };
    }
    case 'history/undo': {
      if (state.history.past.length === 0) return state;
      const present = state.history.past.at(-1)!;
      return updateTemplateFromHistory(state, {
        past: state.history.past.slice(0, -1),
        present,
        future: [state.history.present, ...state.history.future],
        lastCommitTimestamp: 0,
        lastCoalesceKey: undefined,
        activeGroup: undefined,
      });
    }
    case 'history/redo': {
      if (state.history.future.length === 0) return state;
      const [present, ...future] = state.history.future;
      return updateTemplateFromHistory(state, {
        past: [...state.history.past, state.history.present],
        present,
        future,
        lastCommitTimestamp: 0,
        lastCoalesceKey: undefined,
        activeGroup: undefined,
      });
    }
    case 'document/markSaved':
      return { ...state, dirty: false };
    default:
      return state;
  }
}
