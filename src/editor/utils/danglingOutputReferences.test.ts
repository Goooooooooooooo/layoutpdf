import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LayoutPDFTemplate, TemplatePage } from '@/engine/core/document.js';
import { calcPlugin } from '@/plugins/calc/calc.js';
import { tablePlugin } from '@/plugins/table/table.js';
import { createFormulaOutputReference } from '@/utils/calc.js';
import { collectDanglingOutputReferences } from '@/editor/utils/danglingOutputReferences.js';

function buildTemplate(): {
  template: LayoutPDFTemplate;
  tableId: string;
  calcId: string;
  reference: string;
} {
  const table = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
  const footerId = (table.props as { footers: Array<{ id: string }> }).footers[0].id;
  const calc = calcPlugin.createDefaultElement({ id: 'el_calc', position: { x: 10, y: 60 } });
  const reference = createFormulaOutputReference(table.id, footerId);
  calc.value = reference;
  const page = (id: string, elements: TemplatePage['elements']): TemplatePage => ({
    id,
    size: { width: 210, height: 297 },
    padding: [10, 10, 10, 10],
    background: { kind: 'blank', color: '#ffffff' },
    elements,
  });
  return {
    tableId: table.id,
    calcId: calc.id,
    reference,
    template: {
      version: 3,
      id: 'tpl_1',
      name: 'Template',
      pages: [page('page_1', [table]), page('page_2', [calc])],
    },
  };
}

describe('collectDanglingOutputReferences', () => {
  it('lists references from other pages without mutating the template', () => {
    const { template, tableId, calcId, reference } = buildTemplate();

    const dangling = collectDanglingOutputReferences(template, [tableId]);

    assert.deepEqual(dangling, [{ elementId: calcId, reference }]);
    assert.equal(template.pages[0].elements.length, 1);
    assert.equal(
      (template.pages[1].elements[0] as { value: string }).value,
      reference,
    );
  });

  it('returns nothing when the deletion leaves no dangling reference', () => {
    const { template, calcId } = buildTemplate();

    assert.deepEqual(collectDanglingOutputReferences(template, [calcId]), []);
    assert.deepEqual(collectDanglingOutputReferences(template, []), []);
  });
});
