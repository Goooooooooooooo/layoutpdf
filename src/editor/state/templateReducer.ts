import {
  createId,
  type IdGenerator,
  type LayoutPDFTemplate,
  type TemplateElement,
  type TemplatePage,
} from '@/engine/core/document.js';

import type {
  DocumentAction,
  DocumentState,
} from './documentState.js';
import {
  duplicateElementsInPage,
  reconcileTableOutputReferences,
  removeElementsFromTemplate,
} from '@/engine/core/elementEditing.js';
import { setElementPath } from '@/engine/core/elementPath.js';
import {
  expandTemplateElementIdsToGroups,
  normalizeElementGroups,
  remapElementGroupIds,
} from '@/engine/core/elementGroups.js';
import type { TableValueRow } from '@/engine/renderTree/model.js';
import type { TableProps } from '@/plugins/table/table.js';
import type { SummaryBlockProps } from '@/plugins/summary/summary.js';
import {
  createSummaryElementFromTable,
} from '@/editor/utils/summaryBlock.js';

const MAX_HISTORY = 50;
const COALESCE_WINDOW_MS = 300;
function cloneTemplate(template: LayoutPDFTemplate): LayoutPDFTemplate {
  return structuredClone(template);
}

export function elementIds(template: LayoutPDFTemplate): Set<string> {
  return new Set(template.pages.flatMap(page => page.elements.map(element => element.id)));
}

function existingSelection(template: LayoutPDFTemplate, ids: string[]): string[] {
  const existing = elementIds(template);
  return expandTemplateElementIdsToGroups(
    template,
    [...new Set(ids)].filter(id => existing.has(id)),
  );
}

function commitTemplate(
  state: DocumentState,
  template: LayoutPDFTemplate,
  selectedElementIds = state.selectedElementIds,
  activePageId = state.activePageId,
  options?: { coalesceKey?: string; historyGroup?: string },
): DocumentState {
  const now = Date.now();
  const continuingGroup = options?.historyGroup !== undefined
    && state.history.activeGroup?.id === options.historyGroup;
  const canCoalesce = options?.coalesceKey !== undefined
    && state.history.lastCoalesceKey === options.coalesceKey
    && state.history.past.length > 0
    && (now - state.history.lastCommitTimestamp) < COALESCE_WINDOW_MS;
  const past = continuingGroup || canCoalesce
    ? state.history.past
    : [...state.history.past, state.history.present].slice(-MAX_HISTORY);
  const activeGroup = options?.historyGroup === undefined
    ? undefined
    : continuingGroup
      ? state.history.activeGroup
      : {
          id: options.historyGroup,
          before: state.history.present,
          past: state.history.past,
          future: state.history.future,
        };
  return {
    ...state,
    templateFile: { ...state.templateFile, template },
    activePageId,
    selectedElementIds: existingSelection(template, selectedElementIds),
    dirty: true,
    history: {
      past,
      present: template,
      future: [],
      lastCommitTimestamp: now,
      lastCoalesceKey: options?.coalesceKey,
      activeGroup,
    },
  };
}

function blankPage(source: TemplatePage, id: string): TemplatePage {
  return {
    id,
    size: { ...source.size },
    padding: [...source.padding],
    background: { kind: 'blank', color: '#ffffff' },
    elements: [],
  };
}

function updateElements(
  template: LayoutPDFTemplate,
  ids: Set<string>,
  update: (element: TemplateElement<object>) => void,
): void {
  for (const page of template.pages) {
    for (const element of page.elements) {
      if (ids.has(element.id)) update(element);
    }
  }
}

export function templateReducer(
  state: DocumentState,
  action: DocumentAction,
  idGenerator: IdGenerator = createId,
): DocumentState {
  switch (action.type) {
    case 'template/load':
      return createDocumentStateLike(state, action.file);
    case 'document/new':
      return state;
    case 'template/rename': {
      if (state.history.present.name === action.name) return state;
      const template = cloneTemplate(state.history.present);
      template.name = action.name;
      return commitTemplate(state, template);
    }
    case 'page/add': {
      const template = cloneTemplate(state.history.present);
      const sourceIndex = action.afterPageId
        ? template.pages.findIndex(page => page.id === action.afterPageId)
        : template.pages.findIndex(page => page.id === state.activePageId);
      const insertAfter = sourceIndex >= 0 ? sourceIndex : template.pages.length - 1;
      const source = template.pages[Math.max(0, insertAfter)];
      const page = blankPage(source, idGenerator('page'));
      template.pages.splice(insertAfter + 1, 0, page);
      return commitTemplate(state, template, [], page.id);
    }
    case 'page/delete': {
      if (state.history.present.pages.length <= 1) return state;
      const template = cloneTemplate(state.history.present);
      const index = template.pages.findIndex(page => page.id === action.pageId);
      if (index < 0) return state;
      template.pages.splice(index, 1);
      const activePageId = state.activePageId === action.pageId
        ? template.pages[Math.min(index, template.pages.length - 1)].id
        : state.activePageId;
      return commitTemplate(state, template, state.selectedElementIds, activePageId);
    }
    case 'page/reorder': {
      const template = cloneTemplate(state.history.present);
      const index = template.pages.findIndex(page => page.id === action.pageId);
      if (index < 0) return state;
      const [page] = template.pages.splice(index, 1);
      const toIndex = Math.max(0, Math.min(action.toIndex, template.pages.length));
      template.pages.splice(toIndex, 0, page);
      return commitTemplate(state, template);
    }
    case 'page/updatePadding': {
      const template = cloneTemplate(state.history.present);
      const page = template.pages.find(candidate => candidate.id === action.pageId);
      if (!page) return state;
      const padding = action.padding.map(value => Math.max(0, value)) as typeof page.padding;
      if (
        padding[1] + padding[3] >= page.size.width
        || padding[0] + padding[2] >= page.size.height
        || padding.every((value, index) => value === page.padding[index])
      ) return state;
      page.padding = padding;
      return commitTemplate(state, template);
    }
    case 'page/updateSize': {
      const template = cloneTemplate(state.history.present);
      const page = template.pages.find(candidate => candidate.id === action.pageId);
      if (!page) return state;
      if (page.size.width === action.size.width && page.size.height === action.size.height) return state;
      page.size = action.size;
      return commitTemplate(state, template);
    }
    case 'page/updateBackground': {
      const template = cloneTemplate(state.history.present);
      const page = template.pages.find(candidate => candidate.id === action.pageId);
      if (!page || page.background.kind !== 'blank') return state;
      const currentColor = page.background.color ?? null;
      if (currentColor === action.color) return state;
      page.background = action.color === null
        ? { kind: 'blank' }
        : { kind: 'blank', color: action.color };
      return commitTemplate(state, template);
    }
    case 'element/add': {
      const template = cloneTemplate(state.history.present);
      const page = template.pages.find(candidate => candidate.id === action.pageId);
      if (!page || elementIds(template).has(action.element.id)) return state;
      const element = structuredClone(action.element);
      delete element.groupId;
      page.elements.push(element);
      return commitTemplate(state, template, [element.id], page.id);
    }
    case 'elements/add': {
      if (action.elements.length === 0) return state;
      const template = cloneTemplate(state.history.present);
      const page = template.pages.find(candidate => candidate.id === action.pageId);
      if (!page) return state;
      if (action.dedupeKey && page.elements.some(element => element.presetId === action.dedupeKey)) {
        return state;
      }
      const existing = elementIds(template);
      const additions = action.elements.map(element => structuredClone(element));
      if (action.dedupeKey) additions.forEach(element => { element.presetId = action.dedupeKey!; });
      if (additions.some(element => existing.has(element.id))) return state;
      const additionIds = additions.map(element => element.id);
      if (new Set(additionIds).size !== additionIds.length) return state;
      remapElementGroupIds(additions, idGenerator);
      page.elements.push(...additions);
      const nextState = commitTemplate(state, template, additionIds, page.id);
      if (!action.assets || Object.keys(action.assets).length === 0) return nextState;
      return {
        ...nextState,
        templateFile: {
          ...nextState.templateFile,
          assets: { ...nextState.templateFile.assets, ...structuredClone(action.assets) },
        },
      };
    }
    case 'element/update': {
      if (action.ids.length === 0) return state;
      const template = cloneTemplate(state.history.present);
      const ids = new Set(action.ids);
      let changed = false;
      updateElements(template, ids, element => {
        if (element.locked && action.patch.path !== 'locked') return;
        setElementPath(element, action.patch);
        changed = true;
      });
      if (action.patch.path === 'props' || action.patch.path === 'props.footers') {
        reconcileTableOutputReferences(template, ids);
      }
      const isBoxPatch = action.patch.path.startsWith('box.');
      return changed
        ? commitTemplate(state, template, undefined, undefined, action.historyGroup
          ? { historyGroup: action.historyGroup }
          : isBoxPatch
            ? { coalesceKey: 'boxes' }
            : undefined)
        : state;
    }
    case 'element/updatePatches': {
      if (action.ids.length === 0 || action.patches.length === 0) return state;
      const template = cloneTemplate(state.history.present);
      const ids = new Set(action.ids);
      let changed = false;
      updateElements(template, ids, element => {
        for (const patch of action.patches) {
          if (element.locked && patch.path !== 'locked') continue;
          setElementPath(element, patch);
          changed = true;
        }
      });
      if (!changed) return state;
      if (action.patches.some(patch => patch.path === 'props' || patch.path === 'props.footers')) {
        // Reconcile only after every patch has been applied so references observe one atomic result.
        reconcileTableOutputReferences(template, ids);
      }
      return commitTemplate(state, template);
    }
    case 'element/updateBoxes': {
      const entries = Object.entries(action.boxes);
      if (entries.length === 0) return state;
      const template = cloneTemplate(state.history.present);
      const boxes = new Map(entries);
      let changed = false;
      updateElements(template, new Set(boxes.keys()), element => {
        const box = boxes.get(element.id);
        if (!box || element.locked) return;
        element.box = { ...box };
        changed = true;
      });
      return changed
        ? commitTemplate(state, template, undefined, undefined, { coalesceKey: 'boxes' })
        : state;
    }
    case 'element/duplicateToBoxes': {
      const entries = Object.entries(action.boxes);
      if (entries.length === 0) return state;
      const template = cloneTemplate(state.history.present);
      const page = template.pages.find(candidate => candidate.id === action.pageId);
      if (!page) return state;
      const boxes = new Map(entries);
      const additions = duplicateElementsInPage(page, new Set(boxes.keys()), idGenerator, { boxes });
      if (additions.length === 0) return state;
      const existing = elementIds(template);
      const additionIds = additions.map(element => element.id);
      if (
        new Set(additionIds).size !== additionIds.length
        || additionIds.some(id => existing.has(id))
      ) return state;
      page.elements.push(...additions);
      return commitTemplate(state, template, additionIds, page.id);
    }
    case 'element/delete': {
      if (action.ids.length === 0) return state;
      const template = cloneTemplate(state.history.present);
      const removed = removeElementsFromTemplate(template, action.ids);
      return removed.length > 0 ? commitTemplate(state, template) : state;
    }
    case 'element/duplicate': {
      const ids = new Set(action.ids);
      const template = cloneTemplate(state.history.present);
      const duplicatedIds: string[] = [];
      for (const page of template.pages) {
        const additions = duplicateElementsInPage(page, ids, idGenerator);
        duplicatedIds.push(...additions.map(element => element.id));
        page.elements.push(...additions);
      }
      return duplicatedIds.length > 0
        ? commitTemplate(state, template, duplicatedIds)
        : state;
    }
    case 'element/group': {
      const template = cloneTemplate(state.history.present);
      const page = template.pages.find(candidate => candidate.id === action.pageId);
      if (!page) return state;
      const ids = new Set(action.ids);
      const elements = page.elements.filter(element => ids.has(element.id));
      if (elements.length < 2 || elements.some(element => element.locked)) return state;
      const groupId = idGenerator('group');
      elements.forEach(element => { element.groupId = groupId; });
      normalizeElementGroups(page);
      return commitTemplate(state, template, elements.map(element => element.id), page.id);
    }
    case 'element/ungroup': {
      const template = cloneTemplate(state.history.present);
      const page = template.pages.find(candidate => candidate.id === action.pageId);
      if (!page) return state;
      const selected = new Set(action.ids);
      const groupIds = new Set(page.elements
        .filter(element => selected.has(element.id) && element.groupId)
        .map(element => element.groupId!));
      if (groupIds.size === 0) return state;
      const members = page.elements.filter(element => element.groupId && groupIds.has(element.groupId));
      if (members.some(element => element.locked)) return state;
      members.forEach(element => { delete element.groupId; });
      return commitTemplate(state, template, members.map(element => element.id), page.id);
    }
    case 'summary/createFromTable': {
      const template = cloneTemplate(state.history.present);
      for (const page of template.pages) {
        const table = page.elements.find(element => element.id === action.tableId);
        if (!table || table.type !== 'table' || table.locked) continue;
        const typedTable = table as TemplateElement<TableProps, TableValueRow[]>;
        if (typedTable.props.footers.length === 0) return state;
        const summary = createSummaryElementFromTable(typedTable, page, idGenerator);
        page.elements.push(summary as TemplateElement<object>);
        if (action.hideInlineFooter) typedTable.props.showInlineFooter = false;
        return commitTemplate(state, template, [summary.id], page.id);
      }
      return state;
    }
    case 'summary/toggleOutput': {
      const template = cloneTemplate(state.history.present);
      for (const page of template.pages) {
        const summary = page.elements.find(element =>
          element.id === action.summaryId && element.type === 'summary'
        );
        if (!summary || summary.locked) continue;
        const source = page.elements.find(element =>
          element.id === action.sourceElementId && element.type === 'table'
        );
        if (!source) return state;
        const sourceProps = source.props as TableProps;
        const footer = sourceProps.footers.find(candidate => candidate.id === action.outputId);
        if (!footer) return state;
        const props = summary.props as SummaryBlockProps;
        const index = props.items.findIndex(item =>
          item.source.sourceElementId === action.sourceElementId
          && item.source.outputId === action.outputId
        );
        if (action.selected && index < 0) {
          props.items.push({
            id: idGenerator('el'),
            source: {
              sourceElementId: action.sourceElementId,
              outputId: action.outputId,
            },
            labelMode: 'source',
            width: sourceProps.footerBand?.items.find(item => item.footerId === footer.id)?.width ?? 1,
            ...(footer.bold === undefined ? {} : { bold: footer.bold }),
            ...(footer.fontSize === undefined ? {} : { fontSize: footer.fontSize }),
          });
          return commitTemplate(state, template);
        }
        if (!action.selected && index >= 0) {
          props.items.splice(index, 1);
          return commitTemplate(state, template);
        }
        return state;
      }
      return state;
    }
    case 'element/reorder': {
      const template = cloneTemplate(state.history.present);
      const page = template.pages.find(candidate => candidate.id === action.pageId);
      if (!page) return state;
      const ids = new Set(action.ids);
      const moving = page.elements.filter(element => ids.has(element.id));
      if (moving.length === 0) return state;
      const remaining = page.elements.filter(element => !ids.has(element.id));
      const toIndex = Math.max(0, Math.min(action.toIndex, remaining.length));
      remaining.splice(toIndex, 0, ...moving);
      page.elements = remaining;
      return commitTemplate(state, template);
    }
    case 'selection/set':
      return { ...state, selectedElementIds: existingSelection(state.history.present, action.ids) };
    case 'page/activate':
      return state.history.present.pages.some(page => page.id === action.pageId)
        ? { ...state, activePageId: action.pageId, selectedElementIds: [] }
        : state;
    default:
      return state;
  }
}

function createDocumentStateLike(state: DocumentState, file: import('@/engine/core/document.js').TemplateFile): DocumentState {
  const template = cloneTemplate(file.template);
  return {
    ...state,
    templateFile: { ...structuredClone(file), template },
    activePageId: template.pages[0].id,
    selectedElementIds: [],
    dirty: false,
    history: { past: [], present: template, future: [], lastCommitTimestamp: Date.now() },
  };
}
