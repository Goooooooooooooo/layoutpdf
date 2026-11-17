import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBlankTemplateFile } from '@/engine/core/document.js';
import {
  CURRENT_TEMPLATE_VERSION,
  TEMPLATE_FORMAT,
  migrateTemplate,
  type TemplateMigration,
} from '@/engine/core/templateMigration.js';
import { LayoutPDFValidationError } from '@/engine/utils/errors.js';
import type { TemplateFile } from '@/engine/core/document.js';
import { rectPlugin } from '@/plugins/rect/rect.js';
import { tablePlugin } from '@/plugins/table/table.js';

function fileWithVersion(version: number): TemplateFile {
  return { ...createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` }), version };
}

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

function legacyPaginationFile(): Record<string, unknown> {
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
  return JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
}

describe('migrateTemplate', () => {
  it('resolves legacy group-based pagination before validating', () => {
    const migrated = migrateTemplate(legacyPaginationFile());

    const table = migrated.template.pages[0].elements.find(element => element.type === 'table');
    const pagination = (table?.props as { pagination: Record<string, unknown> }).pagination;
    assert.deepEqual(
      pagination.finalElementIds,
      ['el_footer_a', 'el_footer_b'],
      'legacy group members become element refs',
    );
    assert.equal(Object.prototype.hasOwnProperty.call(pagination, 'followGroupId'), false);
  });

  it('keeps explicit final element ids over the legacy group', () => {
    const raw = legacyPaginationFile();
    const elements = ((raw.template as { pages: Array<{ elements: Array<{ props: { pagination: Record<string, unknown> } }> }> }).pages[0].elements);
    elements[0].props.pagination.finalElementIds = ['el_footer_b'];

    const migrated = migrateTemplate(raw);

    const pagination = (migrated.template.pages[0].elements[0].props as { pagination: Record<string, unknown> }).pagination;
    assert.deepEqual(pagination.finalElementIds, ['el_footer_b']);
  });

  it('returns a validated copy of a current template', () => {
    const file = fileWithVersion(CURRENT_TEMPLATE_VERSION);

    const migrated = migrateTemplate(file);

    assert.deepEqual(migrated, file);
    assert.notEqual(migrated, file);
    assert.notEqual(migrated.template, file.template);
  });

  it('rejects a newer template version with an upgrade hint', () => {
    assert.equal(
      errorCode(() => migrateTemplate(fileWithVersion(CURRENT_TEMPLATE_VERSION + 1))),
      'TEMPLATE_VERSION_UNSUPPORTED',
    );
  });

  it('rejects an older version without a registered migration', () => {
    assert.equal(
      errorCode(() => migrateTemplate(fileWithVersion(CURRENT_TEMPLATE_VERSION - 1))),
      'TEMPLATE_VERSION_NOT_MIGRATABLE',
    );
  });

  it('runs migrations in order and stamps each version', () => {
    const calls: Array<{ from: number; version: unknown; name: string }> = [];
    const migrations = new Map<number, TemplateMigration>([
      [1, file => {
        calls.push({ from: 1, version: file.version, name: (file.template as { name: string }).name });
        return { ...file, template: { ...(file.template as object), name: 'from-one' } };
      }],
      [2, file => {
        calls.push({ from: 2, version: file.version, name: (file.template as { name: string }).name });
        return { ...file, template: { ...(file.template as object), name: 'from-two' } };
      }],
    ]);

    const migrated = migrateTemplate(fileWithVersion(1), { migrations });

    assert.deepEqual(calls, [
      { from: 1, version: 1, name: '新規テンプレート' },
      { from: 2, version: 2, name: 'from-one' },
    ]);
    assert.equal(migrated.version, CURRENT_TEMPLATE_VERSION);
    assert.equal(migrated.template.name, 'from-two');
  });

  it('reports a migration that throws', () => {
    const migrations = new Map<number, TemplateMigration>([
      [1, () => { throw new Error('boom'); }],
      [2, file => file],
    ]);

    assert.equal(
      errorCode(() => migrateTemplate(fileWithVersion(1), { migrations })),
      'TEMPLATE_MIGRATION_FAILED',
    );
  });

  it('reports a migration that returns a non-object', () => {
    const migrations = new Map<number, TemplateMigration>([
      [1, () => [] as unknown as Record<string, unknown>],
      [2, file => file],
    ]);

    assert.equal(
      errorCode(() => migrateTemplate(fileWithVersion(1), { migrations })),
      'TEMPLATE_MIGRATION_FAILED',
    );
  });

  it('rejects a different format or a missing version', () => {
    assert.equal(
      errorCode(() => migrateTemplate({ ...fileWithVersion(3), format: 'other' })),
      'TEMPLATE_FORMAT_UNSUPPORTED',
    );
    assert.equal(
      errorCode(() => migrateTemplate({ format: TEMPLATE_FORMAT, template: {} })),
      'TEMPLATE_FORMAT_UNSUPPORTED',
    );
    assert.equal(errorCode(() => migrateTemplate(null)), 'TEMPLATE_FORMAT_UNSUPPORTED');
  });

  it('validates the migrated file before returning it', () => {
    const file = fileWithVersion(CURRENT_TEMPLATE_VERSION);
    const broken = { ...file, template: { ...file.template, pages: [] } };

    assert.throws(() => migrateTemplate(broken), LayoutPDFValidationError);
  });
});
