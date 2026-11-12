import type { TemplateFile } from '@/engine/core/document.js';
import { TABLE_PAGINATION_DEFAULTS } from '@/engine/core/tablePaginationPolicy.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

/**
 * Converts the short-lived group-based Table pagination prototype into stable element refs.
 * The input is never mutated; unchanged files retain their original identity.
 */
export function migrateLegacyTablePagination(file: TemplateFile): TemplateFile {
  const hasLegacyPagination = file.template.pages.some(page => page.elements.some(element => {
    if (element.type !== 'table' || !isRecord(element.props)) return false;
    const pagination = element.props.pagination;
    return isRecord(pagination) && Object.prototype.hasOwnProperty.call(pagination, 'followGroupId');
  }));
  if (!hasLegacyPagination) return file;

  const migrated = structuredClone(file);
  for (const page of migrated.template.pages) {
    for (const element of page.elements) {
      if (element.type !== 'table' || !isRecord(element.props)) continue;
      const pagination = element.props.pagination;
      if (!isRecord(pagination) || !Object.prototype.hasOwnProperty.call(pagination, 'followGroupId')) continue;

      const legacyGroupId = typeof pagination.followGroupId === 'string'
        ? pagination.followGroupId.trim()
        : '';
      const explicitFinalIds = stringArray(pagination.finalElementIds);
      const finalElementIds = explicitFinalIds ?? (legacyGroupId
        ? page.elements
          .filter(candidate => candidate.groupId === legacyGroupId && candidate.type !== 'table')
          .map(candidate => candidate.id)
        : []);
      const repeatElementIds = stringArray(pagination.repeatElementIds)
        ?? [...TABLE_PAGINATION_DEFAULTS.repeatElementIds];
      const rowMode = pagination.rowMode === 'preserve'
        ? 'preserve'
        : TABLE_PAGINATION_DEFAULTS.rowMode;
      const minRowsOnLastPage = typeof pagination.minRowsOnLastPage === 'number'
        ? pagination.minRowsOnLastPage
        : TABLE_PAGINATION_DEFAULTS.minRowsOnLastPage;
      const gapAfterTable = typeof pagination.gapAfterTable === 'number'
        ? pagination.gapAfterTable
        : TABLE_PAGINATION_DEFAULTS.gapAfterTable;
      const { followGroupId: _removed, ...rest } = pagination;
      element.props.pagination = {
        ...rest,
        finalElementIds,
        repeatElementIds,
        rowMode,
        minRowsOnLastPage,
        gapAfterTable,
      };
    }
  }
  return migrated;
}
