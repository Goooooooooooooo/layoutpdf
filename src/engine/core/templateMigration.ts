import type { TemplateFile } from '@/engine/core/document.js';
import { LayoutPDFRuntimeError } from '@/engine/utils/errors.js';
import { assertValidTemplateFile } from '@/engine/core/validation.js';
import { migrateLegacyTablePagination } from '@/engine/core/tablePaginationMigration.js';

/** Template file versions this build can read without migration. */
export const CURRENT_TEMPLATE_VERSION = 3;
export const TEMPLATE_FORMAT = 'layoutpdf-template';

type JsonRecord = Record<string, unknown>;

/**
 * Upgrades one version of the serialized template to the next. The function
 * must be pure: `migrateTemplate` stamps the next `version` itself and
 * validates the result.
 */
export type TemplateMigration = (file: JsonRecord) => JsonRecord;

export interface MigrateTemplateOptions {
  /**
   * Replaces the built-in migration chain. Useful for hosts that version
   * templates independently or for tests; omit it to use the published chain.
   */
  migrations?: ReadonlyMap<number, TemplateMigration>;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Converts a serialized template file to the current format.
 *
 * - A current file is validated and returned as-is.
 * - An older file runs every registered migration in order.
 * - A newer file is rejected with `TEMPLATE_VERSION_UNSUPPORTED` so the host
 *   can ask the user to upgrade the library instead of silently dropping data.
 */
export function migrateTemplate(
  value: unknown,
  options: MigrateTemplateOptions = {},
): TemplateFile {
  if (!isRecord(value)) {
    throw new LayoutPDFRuntimeError(
      'TEMPLATE_FORMAT_UNSUPPORTED',
      `Expected a serialized template file, received ${value === null ? 'null' : typeof value}.`,
      { format: '', detail: 'Expected an object.' },
    );
  }
  if (value.format !== TEMPLATE_FORMAT) {
    throw new LayoutPDFRuntimeError(
      'TEMPLATE_FORMAT_UNSUPPORTED',
      `Unsupported template format "${String(value.format)}". Expected "${TEMPLATE_FORMAT}".`,
      { format: String(value.format), detail: `Expected "${TEMPLATE_FORMAT}".` },
    );
  }
  const version = value.version;
  if (!Number.isSafeInteger(version) || (version as number) < 1) {
    throw new LayoutPDFRuntimeError(
      'TEMPLATE_FORMAT_UNSUPPORTED',
      `Template version must be a positive integer, received ${String(version)}.`,
      { format: TEMPLATE_FORMAT, detail: `Invalid version: ${String(version)}.` },
    );
  }
  if ((version as number) > CURRENT_TEMPLATE_VERSION) {
    throw new LayoutPDFRuntimeError(
      'TEMPLATE_VERSION_UNSUPPORTED',
      `Template version ${version} is newer than supported version ${CURRENT_TEMPLATE_VERSION}. Upgrade the library.`,
      { version: version as number, supported: CURRENT_TEMPLATE_VERSION },
    );
  }

  const migrations = options.migrations ?? new Map<number, TemplateMigration>();
  let current: JsonRecord = value;
  for (let from = version as number; from < CURRENT_TEMPLATE_VERSION; from++) {
    const migration = migrations.get(from);
    if (!migration) {
      throw new LayoutPDFRuntimeError(
        'TEMPLATE_VERSION_NOT_MIGRATABLE',
        `No migration is registered from template version ${from} to ${from + 1}.`,
        { version: version as number, supported: CURRENT_TEMPLATE_VERSION, from },
      );
    }
    let migrated: unknown;
    try {
      migrated = migration(current);
    } catch (error) {
      throw new LayoutPDFRuntimeError(
        'TEMPLATE_MIGRATION_FAILED',
        `Template migration from version ${from} failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          version: version as number,
          from,
          to: from + 1,
          detail: error instanceof Error ? error.message : String(error),
        },
      );
    }
    if (!isRecord(migrated)) {
      throw new LayoutPDFRuntimeError(
        'TEMPLATE_MIGRATION_FAILED',
        `Template migration from version ${from} did not return an object.`,
        { version: version as number, from, to: from + 1, detail: 'Migration returned a non-object.' },
      );
    }
    current = { ...migrated, version: from + 1 };
  }

  current = migrateLegacyTablePagination(current);
  assertValidTemplateFile(current);
  return structuredClone(current);
}
