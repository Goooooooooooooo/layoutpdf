import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPluginRegistry } from '@/engine/core/pluginRegistry.js';
import type {
  IdGenerator,
  IdPrefix,
  TemplateElement,
  TemplatePage,
} from '@/engine/core/document.js';
import { removeSummaryReferences } from '@/engine/core/summaryReferences.js';
import { TemplateEditor } from '@/engine/templateEditor.js';
import { isLayoutPDFRuntimeError } from '@/engine/utils/errors.js';
import { tablePlugin } from '@/plugins/table/table.js';
import { textPlugin } from '@/plugins/text/text.js';

function sequentialIds(): IdGenerator {
  let counter = 0;
  return (prefix: IdPrefix) => `${prefix}_${++counter}`;
}

function createEditor(): TemplateEditor {
  return TemplateEditor.create({
    idGenerator: sequentialIds(),
    plugins: [textPlugin, tablePlugin],
  });
}

function errorCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    assert.ok(isLayoutPDFRuntimeError(error), `expected runtime error, got ${String(error)}`);
    return error.code;
  }
  assert.fail('expected the call to throw');
}

describe('TemplateEditor pages', () => {
  it('adds, updates, reorders, duplicates and removes pages', () => {
    const editor = createEditor();
    const first = editor.pages[0];

    const second = editor.addPage({ size: { width: 100, height: 200 } });
    assert.notEqual(second.id, first.id);
    assert.deepEqual(second.size, { width: 100, height: 200 });
    assert.equal(editor.pages.length, 2);

    editor.updatePage(second.id, { padding: [1, 2, 3, 4] });
    assert.deepEqual(editor.getPage(second.id)!.padding, [1, 2, 3, 4]);
    assert.equal(
      errorCode(() => editor.updatePage(second.id, { size: { width: 5, height: 5 } })),
      'INVALID_PAGE_PADDING',
    );

    editor.movePage(second.id, 0);
    assert.equal(editor.pages[0].id, second.id);

    const copy = editor.duplicatePage(second.id);
    assert.notEqual(copy.id, second.id);
    assert.deepEqual(copy.size, second.size);
    assert.equal(editor.pages.length, 3);

    editor.removePage(copy.id);
    assert.equal(editor.pages.length, 2);
  });

  it('rejects removing the last page and unknown pages', () => {
    const editor = createEditor();
    assert.equal(errorCode(() => editor.removePage(editor.pages[0].id)), 'LAST_PAGE_REQUIRED');
    assert.equal(errorCode(() => editor.updatePage('page_missing', {})), 'PAGE_NOT_FOUND');
    assert.equal(errorCode(() => editor.addPage({ afterPageId: 'page_missing' })), 'PAGE_NOT_FOUND');
  });

  it('rejects duplicate explicitly supplied page ids', () => {
    const editor = createEditor();
    const pageId = editor.pages[0].id;
    assert.equal(errorCode(() => editor.addPage({ id: pageId })), 'PAGE_ID_CONFLICT');
  });
});

describe('TemplateEditor elements', () => {
  it('adds plugin elements and updates nested paths', () => {
    const editor = createEditor();
    const text = editor.addElement('text', { name: 'Greeting', x: 12, y: 18 });
    assert.equal(text.name, 'Greeting');
    assert.deepEqual(text.box, { x: 12, y: 18, width: 80, height: 12 });

    editor.updateElement(text.id, [
      { path: 'box.x', value: 20 },
      { path: 'props.multiline', value: false },
    ]);
    const updated = editor.getElement(text.id)!.element;
    assert.equal(updated.box.x, 20);
    assert.equal((updated.props as { multiline: boolean }).multiline, false);

    editor.setElementBox(text.id, { x: 1, y: 2, width: 30, height: 40 });
    assert.deepEqual(editor.getElement(text.id)!.element.box, {
      x: 1,
      y: 2,
      width: 30,
      height: 40,
    });
  });

  it('requires a plugin registry only for addElement', () => {
    const editor = new TemplateEditor(TemplateEditor.create({ idGenerator: sequentialIds() }).toFile());
    assert.equal(
      errorCode(() => editor.addElement('text', {})),
      'PLUGIN_REGISTRY_REQUIRED',
    );
    const inserted = editor.insertElement({
      id: 'el_custom',
      type: 'custom',
      name: 'Custom',
      box: { x: 0, y: 0, width: 10, height: 10 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: null,
      props: {},
    });
    assert.equal(inserted.id, 'el_custom');
    assert.equal(errorCode(() => editor.insertElement(inserted)), 'ELEMENT_ID_CONFLICT');
  });

  it('enforces locked elements unless forced', () => {
    const editor = createEditor();
    const text = editor.addElement('text', {});
    editor.updateElement(text.id, { path: 'locked', value: true });

    assert.equal(
      errorCode(() => editor.updateElement(text.id, { path: 'box.x', value: 5 })),
      'ELEMENT_LOCKED',
    );
    editor.updateElement(text.id, { path: 'box.x', value: 5 }, { force: true });
    assert.equal(editor.getElement(text.id)!.element.box.x, 5);
  });

  it('removes elements, unlocks groups and cleans table references', () => {
    const editor = createEditor();
    const a = editor.addElement('text', {});
    const b = editor.addElement('text', {});
    const table = editor.addElement('table', {});

    editor.updateElement(a.id, { path: 'groupId', value: 'group_demo' });
    editor.updateElement(b.id, { path: 'groupId', value: 'group_demo' });
    editor.updateElement(table.id, {
      path: 'props.pagination.finalElementIds',
      value: [a.id, b.id],
    });

    const removed = editor.removeElement(a.id);
    assert.deepEqual(removed, [a.id]);
    assert.equal(editor.getElement(a.id), undefined);
    assert.equal(editor.getElement(b.id)!.element.groupId, undefined);
    assert.deepEqual(
      (editor.getElement(table.id)!.element.props as {
        pagination: { finalElementIds: string[] };
      }).pagination.finalElementIds,
      [b.id],
    );
  });

  it('keeps locked elements unless includeLocked is set', () => {
    const editor = createEditor();
    const text = editor.addElement('text', {});
    editor.updateElement(text.id, { path: 'locked', value: true });

    assert.deepEqual(editor.removeElement(text.id), []);
    assert.ok(editor.getElement(text.id));
    assert.deepEqual(editor.removeElement(text.id, { includeLocked: true }), [text.id]);
    assert.equal(editor.getElement(text.id), undefined);
  });

  it('throws for missing elements unless ignoreMissing is set', () => {
    const editor = createEditor();
    assert.equal(errorCode(() => editor.removeElement('el_missing')), 'ELEMENT_NOT_FOUND');
    assert.deepEqual(editor.removeElements(['el_missing'], { ignoreMissing: true }), []);
  });
});

describe('TemplateEditor duplication', () => {
  it('duplicates elements with fresh template-owned identities', () => {
    const editor = createEditor();
    const table = editor.addElement('table', {});
    const original = editor.getElement(table.id)!.element;
    const originalProps = original.props as {
      columns: Array<{ id: string }>;
      footers: Array<{ id: string }>;
    };

    const [copy] = editor.duplicateElement(table.id);
    const duplicated = editor.getElement(copy.id)!.element;
    const duplicatedProps = duplicated.props as {
      columns: Array<{ id: string }>;
      footers: Array<{ id: string }>;
    };

    assert.notEqual(copy.id, table.id);
    assert.equal(copy.pageId, editor.pages[0].id);
    assert.equal(duplicated.name, `${original.name} copy`);
    assert.deepEqual(duplicated.box, {
      ...original.box,
      x: original.box.x + 5,
      y: original.box.y + 5,
    });
    assert.notEqual(duplicated.binding?.key, original.binding?.key);
    assert.equal(
      duplicatedProps.columns.some(column =>
        originalProps.columns.some(source => source.id === column.id)
      ),
      false,
    );
    assert.equal(
      duplicatedProps.footers.some(footer =>
        originalProps.footers.some(source => source.id === footer.id)
      ),
      false,
    );
  });

  it('duplicates whole pages with remapped element and group ids', () => {
    const editor = createEditor();
    const a = editor.addElement('text', {});
    const b = editor.addElement('text', {});
    editor.updateElement(a.id, { path: 'groupId', value: 'group_page' });
    editor.updateElement(b.id, { path: 'groupId', value: 'group_page' });

    const copy = editor.duplicatePage(editor.pages[0].id);
    assert.equal(copy.elements.length, 2);
    assert.equal(copy.id, editor.pages[1].id);
    const sourceIds = new Set([a.id, b.id]);
    assert.equal(copy.elements.some(element => sourceIds.has(element.id)), false);
    const groupIds = new Set(copy.elements.map(element => element.groupId));
    assert.equal(groupIds.size, 1);
    assert.notEqual([...groupIds][0], 'group_page');
  });
});

describe('TemplateEditor moving', () => {
  it('changes z-order without changing position', () => {
    const editor = createEditor();
    const a = editor.addElement('text', { x: 1 });
    const b = editor.addElement('text', { x: 2 });
    assert.deepEqual(editor.pages[0].elements.map(element => element.id), [a.id, b.id]);

    editor.moveElement(a.id, { index: 1 });
    assert.deepEqual(editor.pages[0].elements.map(element => element.id), [b.id, a.id]);
    assert.equal(editor.getElement(a.id)!.element.box.x, 1);
  });

  it('applies offsets without reordering when no index is given', () => {
    const editor = createEditor();
    const a = editor.addElement('text', { x: 1 });
    const b = editor.addElement('text', { x: 2 });
    editor.moveElement(a.id, { offset: { x: 10, y: 20 } });

    assert.deepEqual(editor.pages[0].elements.map(element => element.id), [a.id, b.id]);
    assert.deepEqual(editor.getElement(a.id)!.element.box, {
      x: 11,
      y: 20,
      width: 80,
      height: 12,
    });
    assert.equal(editor.getElement(b.id)!.element.box.x, 2);
  });

  it('moves elements across pages and drops stale pagination references', () => {
    const editor = createEditor();
    const text = editor.addElement('text', {});
    const table = editor.addElement('table', {});
    const second = editor.addPage();
    editor.updateElement(table.id, {
      path: 'props.pagination.finalElementIds',
      value: [text.id],
    });

    editor.moveElement(text.id, { pageId: second.id });
    assert.equal(editor.getElement(text.id)!.pageId, second.id);
    assert.deepEqual(
      (editor.getElement(table.id)!.element.props as {
        pagination: { finalElementIds: string[] };
      }).pagination.finalElementIds,
      [],
    );
  });
});

describe('TemplateEditor documents', () => {
  it('round-trips through JSON and validates on read', () => {
    const editor = createEditor();
    const text = editor.addElement('text', { x: 4 });
    editor.rename('Invoice');
    const json = editor.toJson(0);
    const restored = new TemplateEditor(json, {
      plugins: createPluginRegistry([textPlugin]),
    });
    assert.equal(restored.name, 'Invoice');
    assert.equal(restored.getElement(text.id)!.element.box.x, 4);
    assert.equal(JSON.parse(json).format, 'layoutpdf-template');
  });

  it('clones a document under a new template id', () => {
    const editor = createEditor();
    const text = editor.addElement('text', {});
    const clone = editor.cloneAs('tpl_clone');
    assert.equal(clone.templateId, 'tpl_clone');
    // Element ids are regenerated by whole-document cloning.
    assert.equal(clone.getElement(text.id), undefined);
    assert.notEqual(clone.pages[0].elements[0].id, text.id);
    assert.equal(clone.pages[0].elements.length, 1);
  });
});

describe('removeSummaryReferences', () => {
  it('drops summary items that point at a deleted source', () => {
    const page = {
      elements: [{
        type: 'summary',
        props: {
          items: [
            { id: 'item_1', source: { sourceElementId: 'el_1', outputId: 'footer_1' } },
            { id: 'item_2', source: { sourceElementId: 'el_2', outputId: 'footer_2' } },
          ],
        },
      }],
    } as unknown as Pick<TemplatePage, 'elements'>;

    const removed = removeSummaryReferences(page, sourceElementId => sourceElementId === 'el_1');

    assert.equal(removed, 1);
    const items = (page.elements[0] as TemplateElement<object>).props as {
      items: Array<{ id: string }>;
    };
    assert.deepEqual(items.items.map(item => item.id), ['item_2']);
  });
});
