import {
  createId,
  type LayoutPDFTemplate,
  type ElementBox,
  type IdGenerator,
  type JsonValue,
  type TemplateAsset,
  type TemplateElement,
  type TemplateFile,
} from '@/engine/core/document.js';
import { createInputSet, type LayoutPDFInputSet, type InputRecord } from '@/engine/core/input.js';
import { templateReducer } from './templateReducer.js';
import { inputReducer } from './inputReducer.js';
import { historyReducer } from './historyReducer.js';

export type DocumentMode = 'designer' | 'preview';

export interface HistoryState {
  past: LayoutPDFTemplate[];
  present: LayoutPDFTemplate;
  future: LayoutPDFTemplate[];
  lastCommitTimestamp: number;
  lastCoalesceKey?: string;
  activeGroup?: {
    id: string;
    before: LayoutPDFTemplate;
    past: LayoutPDFTemplate[];
    future: LayoutPDFTemplate[];
  };
}

export interface DocumentState {
  templateFile: TemplateFile;
  inputs: LayoutPDFInputSet;
  mode: DocumentMode;
  activePageId: string;
  selectedElementIds: string[];
  dirty: boolean;
  history: HistoryState;
}

export interface ElementPatch {
  path: string;
  value: JsonValue;
}

export type DocumentAction =
  | { type: 'template/load'; file: TemplateFile }
  | { type: 'document/new'; file: TemplateFile }
  | { type: 'template/rename'; name: string }
  | { type: 'page/add'; afterPageId?: string }
  | { type: 'page/delete'; pageId: string }
  | { type: 'page/reorder'; pageId: string; toIndex: number }
  | { type: 'page/updatePadding'; pageId: string; padding: [number, number, number, number] }
  | { type: 'page/updateSize'; pageId: string; size: { width: number; height: number } }
  | { type: 'page/updateBackground'; pageId: string; color: string | null }
  | { type: 'element/add'; pageId: string; element: TemplateElement<object> }
  | { type: 'elements/add'; pageId: string; elements: TemplateElement<object>[]; assets?: Record<string, TemplateAsset>; dedupeKey?: string }
  | { type: 'element/update'; ids: string[]; patch: ElementPatch; historyGroup?: string }
  | { type: 'element/updatePatches'; ids: string[]; patches: ElementPatch[] }
  | { type: 'element/updateBoxes'; boxes: Record<string, ElementBox> }
  | { type: 'element/duplicateToBoxes'; pageId: string; boxes: Record<string, ElementBox> }
  | { type: 'element/delete'; ids: string[] }
  | { type: 'element/duplicate'; ids: string[] }
  | { type: 'element/group'; pageId: string; ids: string[] }
  | { type: 'element/ungroup'; pageId: string; ids: string[] }
  | { type: 'element/reorder'; pageId: string; ids: string[]; toIndex: number }
  | { type: 'summary/createFromTable'; tableId: string; hideInlineFooter: boolean }
  | {
      type: 'summary/toggleOutput';
      summaryId: string;
      sourceElementId: string;
      outputId: string;
      selected: boolean;
    }
  | { type: 'selection/set'; ids: string[] }
  | { type: 'page/activate'; pageId: string }
  | { type: 'input/update'; recordIndex: number; key: string; value: JsonValue }
  | { type: 'input/addRecord' }
  | { type: 'input/deleteRecord'; index: number }
  | { type: 'input/activateRecord'; index: number }
  | { type: 'mode/set'; mode: DocumentMode }
  | { type: 'history/undo' }
  | { type: 'history/redo' }
  | { type: 'history/endGroup'; group: string }
  | { type: 'history/cancelGroup'; group: string }
  | { type: 'document/markSaved' };

function combineReducers(
  ...reducers: Array<(state: DocumentState, action: DocumentAction) => DocumentState>
): (state: DocumentState, action: DocumentAction) => DocumentState {
  return (state, action) => reducers.reduce((next, reducer) => reducer(next, action), state);
}

export function createDocumentState(file: TemplateFile, initialInputs?: InputRecord[]): DocumentState {
  const template = structuredClone(file.template);
  return {
    templateFile: { ...structuredClone(file), template },
    inputs: createInputSet(initialInputs?.map(record => structuredClone(record))),
    mode: 'designer',
    activePageId: template.pages[0].id,
    selectedElementIds: [],
    dirty: false,
    history: { past: [], present: template, future: [], lastCommitTimestamp: Date.now() },
  };
}

export function createDocumentReducer(idGenerator: IdGenerator = createId) {
  const combined = combineReducers(
    (state, action) => templateReducer(state, action, idGenerator),
    inputReducer,
    historyReducer,
  );
  return function documentReducer(state: DocumentState, action: DocumentAction): DocumentState {
    switch (action.type) {
      case 'template/load':
        return createDocumentState(action.file);
      case 'document/new':
        return { ...createDocumentState(action.file), dirty: true };
      default:
        return combined(state, action);
    }
  };
}

export const documentReducer = createDocumentReducer();
