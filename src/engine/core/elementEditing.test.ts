import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  IdGenerator,
  IdPrefix,
  LayoutPDFTemplate,
  TemplatePage,
} from '@/engine/core/document.js';
import {
  duplicateElementsInPage,
  removeElementsFromTemplate,
} from '@/engine/core/elementEditing.js';
import { calcPlugin } from '@/plugins/calc/calc.js';
import { tablePlugin } from '@/plugins/table/table.js';
import { createFormulaOutputReference } from '@/utils/calc.js';

function sequentialIds(): IdGenerator {
  let counter = 0;
  return (prefix: IdPrefix) => `${prefix}_${++counter}`;
}

function tableFooterId(element: ReturnType<typeof tablePlugin.createDefaultElement>): string {
  return (element.props as { footers: Array<{ id: string }> }).footers[0].id;
}

function buildPage(): {
  page: TemplatePage;
  table: ReturnType<typeof tablePlugin.createDefaultElement>;
  calc: ReturnType<typeof calcPlugin.createDefaultElement>;
  footerId: string;
} {
  const table = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
  const footerId = tableFooterId(table);
  const calc = calcPlugin.createDefaultElement({ id: 'el_calc', position: { x: 10, y: 60 } });
  calc.value = createFormulaOutputReference(table.id, footerId);
  const page: TemplatePage = {
    id: 'page_1',
    size: { width: 210, height: 297 },
    padding: [10, 10, 10, 10],
    background: { kind: 'blank', color: '#ffffff' },
    elements: [table, calc],
  };
  return { page, table, calc, footerId };
}

function templateWith(page: TemplatePage): LayoutPDFTemplate {
  return { version: 3, id: 'tpl_1', name: 'Template', pages: [page] };
}

describe('duplicateElementsInPage', () => {
  it('remaps calc output references to the duplicated table outputs', () => {
    const { page, table, footerId } = buildPage();
    const ids = sequentialIds();

    const additions = duplicateElementsInPage(
      page,
      new Set([table.id, 'el_calc']),
      ids,
    );
    const duplicatedTable = additions.find(element => element.type === 'table')!;
    const duplicatedCalc = additions.find(element => element.type === 'calc')!;
    const duplicatedFooterId = tableFooterId(
      duplicatedTable as ReturnType<typeof tablePlugin.createDefaultElement>,
    );

    assert.equal(
      duplicatedCalc.value,
      createFormulaOutputReference(duplicatedTable.id, duplicatedFooterId),
    );
    assert.notEqual(
      duplicatedCalc.value,
      createFormulaOutputReference(table.id, footerId),
    );
  });

  it('leaves references to a table that was not duplicated untouched', () => {
    const { page, table, calc, footerId } = buildPage();
    const additions = duplicateElementsInPage(page, new Set([calc.id]), sequentialIds());
    const duplicatedCalc = additions.find(element => element.type === 'calc')!;

    assert.equal(
      duplicatedCalc.value,
      createFormulaOutputReference(table.id, footerId),
    );
  });
});

describe('removeElementsFromTemplate', () => {
  it('reports calc references that point at a removed table output', () => {
    const { page, table, calc, footerId } = buildPage();
    const template = templateWith(page);
    const seen: Array<{ elementId: string; reference: string }> = [];

    const removed = removeElementsFromTemplate(template, [table.id], {
      onDanglingOutputReference: reference => seen.push(reference),
    });

    assert.deepEqual(removed, [table.id]);
    assert.deepEqual(template.pages[0].elements.map(element => element.id), [calc.id]);
    assert.deepEqual(seen, [{
      elementId: calc.id,
      reference: createFormulaOutputReference(table.id, footerId),
    }]);
  });

  it('does not report references that survive the deletion', () => {
    const { page, table } = buildPage();
    const template = templateWith(page);
    const seen: unknown[] = [];

    removeElementsFromTemplate(template, ['el_calc'], {
      onDanglingOutputReference: reference => seen.push(reference),
    });

    assert.deepEqual(seen, []);
    assert.equal(template.pages[0].elements.length, 1);
    assert.equal(template.pages[0].elements[0].id, table.id);
  });

  it('reports references from a formula on another page', () => {
    const table = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
    const footerId = tableFooterId(table);
    const calc = calcPlugin.createDefaultElement({ id: 'el_calc', position: { x: 10, y: 20 } });
    calc.value = createFormulaOutputReference(table.id, footerId);
    const page = (id: string, elements: TemplatePage['elements']): TemplatePage => ({
      id,
      size: { width: 210, height: 297 },
      padding: [10, 10, 10, 10],
      background: { kind: 'blank', color: '#ffffff' },
      elements,
    });
    const template: LayoutPDFTemplate = {
      version: 3,
      id: 'tpl_1',
      name: 'Template',
      pages: [page('page_1', [table]), page('page_2', [calc])],
    };
    const seen: Array<{ elementId: string; reference: string }> = [];

    removeElementsFromTemplate(template, [table.id], {
      onDanglingOutputReference: reference => seen.push(reference),
    });

    assert.deepEqual(seen, [{
      elementId: calc.id,
      reference: createFormulaOutputReference(table.id, footerId),
    }]);
  });
});
