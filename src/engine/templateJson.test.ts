import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBlankTemplateFile } from '@/engine/core/document.js';
import { parseTemplateJson, stringifyTemplateJson } from '@/engine/templateJson.js';
import { rectPlugin } from '@/plugins/rect/rect.js';
import { tablePlugin } from '@/plugins/table/table.js';

function legacyPaginationFile(): ReturnType<typeof createBlankTemplateFile> {
  const table = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
  const footerA = rectPlugin.createDefaultElement({ id: 'el_footer_a', position: { x: 10, y: 60 } });
  const footerB = rectPlugin.createDefaultElement({ id: 'el_footer_b', position: { x: 10, y: 70 } });
  footerA.groupId = 'grp_footer';
  footerB.groupId = 'grp_footer';
  const pagination = (table.props as { pagination: Record<string, unknown> }).pagination;
  delete pagination.finalElementIds;
  pagination.followGroupId = 'grp_footer';
  const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
  file.template.pages[0].elements.push(table, footerA, footerB);
  return file;
}

describe('parseTemplateJson', () => {
  it('resolves legacy group-based pagination instead of dropping it', () => {
    const file = parseTemplateJson(JSON.stringify(legacyPaginationFile(), null, 2));

    const table = file.template.pages[0].elements.find(element => element.type === 'table');
    const pagination = (table?.props as { pagination: Record<string, unknown> }).pagination;
    assert.deepEqual(pagination.finalElementIds, ['el_footer_a', 'el_footer_b']);
    assert.equal(Object.prototype.hasOwnProperty.call(pagination, 'followGroupId'), false);
  });

  it('writes the resolved refs when serializing a legacy in-memory file', () => {
    const legacy = legacyPaginationFile();

    const text = stringifyTemplateJson(legacy);
    const saved = JSON.parse(text) as {
      template: { pages: Array<{ elements: Array<{ type: string; props: { pagination: Record<string, unknown> } }> }> };
    };
    const table = saved.template.pages[0].elements.find(element => element.type === 'table');
    assert.deepEqual(table?.props.pagination.finalElementIds, ['el_footer_a', 'el_footer_b']);
    assert.equal(Object.prototype.hasOwnProperty.call(table?.props.pagination ?? {}, 'followGroupId'), false);
  });

  it('leaves a current file untouched', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });

    assert.equal(parseTemplateJson(stringifyTemplateJson(file)).version, 3);
  });
});
