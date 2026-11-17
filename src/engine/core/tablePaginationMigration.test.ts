import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBlankTemplateFile } from '@/engine/core/document.js';
import { migrateLegacyTablePagination } from '@/engine/core/tablePaginationMigration.js';
import { TABLE_PAGINATION_DEFAULTS } from '@/engine/core/tablePaginationPolicy.js';
import { rectPlugin } from '@/plugins/rect/rect.js';
import { tablePlugin } from '@/plugins/table/table.js';

function legacyFile(): ReturnType<typeof createBlankTemplateFile> {
  const table = tablePlugin.createDefaultElement({ id: 'el_table', position: { x: 10, y: 20 } });
  const footer = rectPlugin.createDefaultElement({ id: 'el_footer', position: { x: 10, y: 60 } });
  const sibling = rectPlugin.createDefaultElement({ id: 'el_sibling', position: { x: 10, y: 70 } });
  footer.groupId = 'grp_footer';
  sibling.groupId = 'grp_footer';
  const pagination = (table.props as { pagination: Record<string, unknown> }).pagination;
  for (const key of Object.keys(pagination)) {
    if (key !== 'followGroupId') delete pagination[key];
  }
  pagination.followGroupId = 'grp_footer';
  const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
  file.template.pages[0].elements.push(table, footer, sibling);
  return file;
}

describe('migrateLegacyTablePagination', () => {
  it('returns the same file when no legacy pagination is present', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });

    assert.equal(migrateLegacyTablePagination(file), file);
  });

  it('resolves refs and fills defaults without mutating the input', () => {
    const file = legacyFile();
    const snapshot = structuredClone(file);

    const migrated = migrateLegacyTablePagination(file);

    assert.notEqual(migrated, file);
    assert.deepEqual(file, snapshot, 'input stays untouched for undo-friendly callers');
    const migratedTable = migrated.template.pages[0].elements.find(element => element.type === 'table');
    const pagination = (migratedTable?.props as { pagination: Record<string, unknown> }).pagination;
    assert.deepEqual(pagination.finalElementIds, ['el_footer', 'el_sibling']);
    assert.deepEqual(pagination.repeatElementIds, [...TABLE_PAGINATION_DEFAULTS.repeatElementIds]);
    assert.equal(pagination.rowMode, TABLE_PAGINATION_DEFAULTS.rowMode);
    assert.equal(pagination.minRowsOnLastPage, TABLE_PAGINATION_DEFAULTS.minRowsOnLastPage);
    assert.equal(pagination.gapAfterTable, TABLE_PAGINATION_DEFAULTS.gapAfterTable);
    assert.equal(Object.prototype.hasOwnProperty.call(pagination, 'followGroupId'), false);
  });

  it('falls back to an empty list when the legacy group is gone', () => {
    const file = legacyFile();
    for (const element of file.template.pages[0].elements) delete element.groupId;

    const migrated = migrateLegacyTablePagination(file);

    const migratedTable = migrated.template.pages[0].elements.find(element => element.type === 'table');
    const pagination = (migratedTable?.props as { pagination: Record<string, unknown> }).pagination;
    assert.deepEqual(pagination.finalElementIds, []);
  });
});
