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

describe('migrateTemplate', () => {
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
