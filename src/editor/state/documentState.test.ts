import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createBlankTemplateFile,
  type ElementBox,
  type IdGenerator,
  type TemplateAsset,
  type TemplateElement,
  type TemplateFile,
} from '@/engine/core/document.js';
import {
  createDocumentReducer,
  createDocumentState,
  type DocumentState,
} from '@/editor/state/documentState.js';

function sequentialIds(): IdGenerator {
  let counter = 0;
  return prefix => `${prefix}_${++counter}`;
}

function setup(): {
  reducer: ReturnType<typeof createDocumentReducer>;
  state: DocumentState;
  pageId: string;
} {
  const idGenerator = sequentialIds();
  const file = createBlankTemplateFile({ idGenerator, name: 'Reducer test' });
  return {
    reducer: createDocumentReducer(idGenerator),
    state: createDocumentState(file),
    pageId: file.template.pages[0].id,
  };
}

function element(id: string, overrides: Partial<TemplateElement<object>> = {}): TemplateElement<object> {
  return {
    id,
    type: 'rect',
    name: id,
    box: { x: 10, y: 10, width: 20, height: 20 },
    rotate: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    value: null,
    props: { fill: '#ffffff' },
    ...overrides,
  };
}

function imageElement(id: string, assetId: string): TemplateElement<object> {
  return element(id, {
    type: 'image',
    value: { source: 'asset', assetId },
  });
}

function rectIds(state: DocumentState): string[] {
  return state.history.present.pages[0].elements.map(candidate => candidate.id);
}

function boxes(reducer: ReturnType<typeof createDocumentReducer>, state: DocumentState, id: string, x: number): DocumentState {
  const current = state.history.present.pages[0].elements.find(candidate => candidate.id === id)!;
  const box: ElementBox = { ...current.box, x };
  return reducer(state, { type: 'element/updateBoxes', boxes: { [id]: box } });
}

const asset: TemplateAsset = {
  kind: 'image',
  name: 'logo.png',
  mimeType: 'image/png',
  dataEncoding: 'base64',
  data: 'AAAA',
};

describe('templateReducer', () => {
  it('rejects duplicate element ids without creating a history step', () => {
    const { reducer, state, pageId } = setup();
    const added = reducer(state, { type: 'element/add', pageId, element: element('el_a') });

    const duplicate = reducer(added, { type: 'element/add', pageId, element: element('el_a') });

    assert.equal(duplicate, added);
    assert.deepEqual(rectIds(duplicate), ['el_a']);
  });

  it('blocks property edits on locked elements but still allows unlocking', () => {
    const { reducer, state, pageId } = setup();
    let next = reducer(state, {
      type: 'element/add',
      pageId,
      element: element('el_locked', { locked: true }),
    });

    next = reducer(next, {
      type: 'element/update',
      ids: ['el_locked'],
      patch: { path: 'props.fill', value: '#ff0000' },
    });
    assert.equal(next.history.present.pages[0].elements[0].props.fill, '#ffffff');

    next = reducer(next, {
      type: 'element/update',
      ids: ['el_locked'],
      patch: { path: 'locked', value: false },
    });
    next = reducer(next, {
      type: 'element/update',
      ids: ['el_locked'],
      patch: { path: 'props.fill', value: '#ff0000' },
    });
    assert.equal(next.history.present.pages[0].elements[0].props.fill, '#ff0000');
  });

  it('moves elements to the requested final index', () => {
    const { reducer, state, pageId } = setup();
    let next = reducer(state, {
      type: 'elements/add',
      pageId,
      elements: [element('el_a'), element('el_b'), element('el_c')],
    });

    next = reducer(next, { type: 'element/reorder', pageId, ids: ['el_a'], toIndex: 2 });

    assert.deepEqual(rectIds(next), ['el_b', 'el_c', 'el_a']);
  });

  it('expands a group member selection to the whole group', () => {
    const { reducer, state, pageId } = setup();
    let next = reducer(state, {
      type: 'elements/add',
      pageId,
      elements: [element('el_a'), element('el_b'), element('el_c')],
    });
    next = reducer(next, { type: 'element/group', pageId, ids: ['el_a', 'el_b'] });

    next = reducer(next, { type: 'selection/set', ids: ['el_a'] });

    assert.deepEqual([...next.selectedElementIds].sort(), ['el_a', 'el_b']);
  });

  it('ungroups every member and keeps them selected', () => {
    const { reducer, state, pageId } = setup();
    let next = reducer(state, {
      type: 'elements/add',
      pageId,
      elements: [element('el_a'), element('el_b'), element('el_c')],
    });
    next = reducer(next, { type: 'element/group', pageId, ids: ['el_a', 'el_b'] });

    next = reducer(next, { type: 'element/ungroup', pageId, ids: ['el_a'] });

    const elements = next.history.present.pages[0].elements;
    assert.equal(elements.some(candidate => candidate.groupId !== undefined), false);
    assert.deepEqual([...next.selectedElementIds].sort(), ['el_a', 'el_b']);
  });

  it('remaps copied group ids so a pasted group stays separate', () => {
    const { reducer, state, pageId } = setup();
    let next = reducer(state, {
      type: 'elements/add',
      pageId,
      elements: [element('el_a'), element('el_b')],
    });
    next = reducer(next, { type: 'element/group', pageId, ids: ['el_a', 'el_b'] });
    const originalGroup = next.history.present.pages[0].elements[0].groupId;
    assert.ok(originalGroup);

    next = reducer(next, {
      type: 'elements/add',
      pageId,
      elements: [
        element('el_c', { groupId: originalGroup }),
        element('el_d', { groupId: originalGroup }),
      ],
    });

    const copied = next.history.present.pages[0].elements.filter(candidate =>
      candidate.id === 'el_c' || candidate.id === 'el_d'
    );
    assert.equal(copied[0].groupId, copied[1].groupId);
    assert.notEqual(copied[0].groupId, originalGroup);
    assert.deepEqual([...next.selectedElementIds].sort(), ['el_c', 'el_d']);
  });

  it('activates a neighbouring page when the active page is deleted', () => {
    const { reducer, state, pageId } = setup();
    let next = reducer(state, { type: 'page/add' });
    const addedPage = next.activePageId;
    assert.notEqual(addedPage, pageId);

    next = reducer(next, { type: 'page/delete', pageId: addedPage });

    assert.equal(next.activePageId, pageId);
    assert.equal(next.history.present.pages.length, 1);
  });

  it('refuses to delete the last page', () => {
    const { reducer, state, pageId } = setup();

    const next = reducer(state, { type: 'page/delete', pageId });

    assert.equal(next, state);
    assert.equal(next.history.present.pages.length, 1);
  });

  it('loads a new template file with a clean history and dirty flag', () => {
    const { reducer, state, pageId } = setup();
    const dirty = reducer(state, { type: 'element/add', pageId, element: element('el_a') });
    assert.equal(dirty.dirty, true);

    const target: TemplateFile = createBlankTemplateFile({ idGenerator: sequentialIds(), name: 'Loaded' });
    const loaded = reducer(dirty, { type: 'template/load', file: target });

    assert.equal(loaded.dirty, false);
    assert.deepEqual(loaded.history.past, []);
    assert.equal(loaded.history.present.name, 'Loaded');
    assert.deepEqual(loaded.selectedElementIds, []);
  });
});

describe('historyReducer', () => {
  it('undoes and redoes a change and marks the document dirty', () => {
    const { reducer, state, pageId } = setup();
    const added = reducer(state, { type: 'element/add', pageId, element: element('el_a') });
    assert.equal(added.dirty, true);

    const undone = reducer(added, { type: 'history/undo' });
    assert.deepEqual(rectIds(undone), []);
    assert.equal(undone.dirty, true);
    assert.equal(undone.history.past.length, 0);

    const redone = reducer(undone, { type: 'history/redo' });
    assert.deepEqual(rectIds(redone), ['el_a']);
  });

  it('drops a selection that the undo target no longer contains', () => {
    const { reducer, state, pageId } = setup();
    const added = reducer(state, { type: 'element/add', pageId, element: element('el_a') });
    const selected = reducer(added, { type: 'selection/set', ids: ['el_a'] });

    const undone = reducer(selected, { type: 'history/undo' });

    assert.deepEqual(undone.selectedElementIds, []);
  });

  it('marks a saved document dirty again after undo', () => {
    const { reducer, state, pageId } = setup();
    const added = reducer(state, { type: 'element/add', pageId, element: element('el_a') });
    const saved = reducer(added, { type: 'document/markSaved' });
    assert.equal(saved.dirty, false);

    const undone = reducer(saved, { type: 'history/undo' });

    assert.equal(undone.dirty, true);
  });

  it('coalesces consecutive box drags inside the window and splits them after it', t => {
    const { reducer, state, pageId } = setup();
    let now = 1_000;
    t.mock.method(Date, 'now', () => now);
    let next = reducer(state, { type: 'element/add', pageId, element: element('el_a') });
    const afterAdd = next.history.past.length;

    next = boxes(reducer, next, 'el_a', 10);
    now += 100;
    next = boxes(reducer, next, 'el_a', 30);
    assert.equal(next.history.past.length, afterAdd + 1, 'drag frames share one entry');
    assert.equal(next.history.present.pages[0].elements[0].box.x, 30);

    const undone = reducer(next, { type: 'history/undo' });
    assert.equal(undone.history.present.pages[0].elements[0].box.x, 10);

    now += 400;
    next = boxes(reducer, next, 'el_a', 50);
    assert.equal(next.history.past.length, afterAdd + 2, 'a later drag starts a new entry');
  });

  it('records a history group as one undo step', () => {
    const { reducer, state, pageId } = setup();
    let next = reducer(state, { type: 'element/add', pageId, element: element('el_a') });
    const afterAdd = next.history.past.length;

    next = reducer(next, {
      type: 'element/update',
      ids: ['el_a'],
      patch: { path: 'box.x', value: 20 },
      historyGroup: 'drag',
    });
    next = reducer(next, {
      type: 'element/update',
      ids: ['el_a'],
      patch: { path: 'box.x', value: 40 },
      historyGroup: 'drag',
    });
    assert.equal(next.history.past.length, afterAdd + 1);

    const undone = reducer(next, { type: 'history/undo' });
    assert.equal(undone.history.present.pages[0].elements[0].box.x, 10);
  });

  it('cancels an active group back to its snapshot', () => {
    const { reducer, state, pageId } = setup();
    let next = reducer(state, { type: 'element/add', pageId, element: element('el_a') });
    const afterAdd = next;
    next = reducer(next, {
      type: 'element/update',
      ids: ['el_a'],
      patch: { path: 'box.x', value: 20 },
      historyGroup: 'drag',
    });
    next = reducer(next, {
      type: 'element/update',
      ids: ['el_a'],
      patch: { path: 'box.x', value: 40 },
      historyGroup: 'drag',
    });

    const cancelled = reducer(next, { type: 'history/cancelGroup', group: 'drag' });

    assert.equal(cancelled.history.present.pages[0].elements[0].box.x, 10);
    assert.equal(cancelled.history.past.length, afterAdd.history.past.length);
    assert.equal(cancelled.history.activeGroup, undefined);
    assert.equal(cancelled.dirty, true);
  });

  it('caps the undo stack at 50 entries', () => {
    const { reducer, state, pageId } = setup();
    let next = state;
    for (let index = 0; index < 55; index += 1) {
      next = reducer(next, {
        type: 'element/add',
        pageId,
        element: element(`el_${index}`),
      });
    }

    assert.equal(next.history.past.length, 50);
    for (let index = 0; index < 50; index += 1) {
      next = reducer(next, { type: 'history/undo' });
    }
    // The oldest five additions left the history window with their snapshots.
    assert.equal(next.history.past.length, 0);
    assert.equal(rectIds(next).length, 5);
    assert.equal(reducer(next, { type: 'history/undo' }), next);
  });

  it('keeps assets reachable from redo after undoing an asset-bearing add', () => {
    const { reducer, state, pageId } = setup();
    const added = reducer(state, {
      type: 'elements/add',
      pageId,
      elements: [imageElement('el_image', 'asset_1')],
      assets: { asset_1: asset },
    });
    assert.deepEqual(Object.keys(added.templateFile.assets), ['asset_1']);

    const undone = reducer(added, { type: 'history/undo' });
    // The undo target has no image, but redo can bring it back, so the bytes
    // stay available until the snapshot leaves the history.
    assert.deepEqual(Object.keys(undone.templateFile.assets), ['asset_1']);
    // History navigation must not mutate snapshots that still reference assets.
    assert.deepEqual(Object.keys(added.templateFile.assets), ['asset_1']);

    const redone = reducer(undone, { type: 'history/redo' });
    assert.deepEqual(Object.keys(redone.templateFile.assets), ['asset_1']);
  });
});
