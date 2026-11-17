import { TABLE_PAGINATION_DEFAULTS } from '@/engine/core/tablePaginationPolicy.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function pageElements(page: unknown): unknown[] {
  return isRecord(page) && Array.isArray(page.elements) ? page.elements : [];
}

function legacyPaginationOf(element: unknown): JsonRecord | undefined {
  if (!isRecord(element) || element.type !== 'table' || !isRecord(element.props)) return undefined;
  const pagination = element.props.pagination;
  if (!isRecord(pagination)) return undefined;
  return Object.prototype.hasOwnProperty.call(pagination, 'followGroupId')
    ? pagination
    : undefined;
}

/**
 * Converts the short-lived group-based Table pagination prototype into stable element refs.
 *
 * Both `migrateTemplate` and `parseTemplateJson` run this before validation:
 * the schema only knows the element-ref shape, so without this step a legacy
 * `followGroupId` is stripped and the final-page elements silently lose their
 * placement. The input is never mutated; files without the legacy key keep
 * their original identity.
 */
export function migrateLegacyTablePagination<T>(file: T): T {
  if (!isRecord(file)) return file;
  const template = file.template;
  if (!isRecord(template) || !Array.isArray(template.pages)) return file;
  const hasLegacyPagination = template.pages.some(page =>
    pageElements(page).some(element => legacyPaginationOf(element) !== undefined)
  );
  if (!hasLegacyPagination) return file;

  const migrated = structuredClone(file) as JsonRecord;
  const pages = (migrated.template as JsonRecord).pages as unknown[];
  for (const page of pages) {
    const elements = pageElements(page);
    for (const element of elements) {
      const pagination = legacyPaginationOf(element);
      if (!pagination) continue;

      const legacyGroupId = typeof pagination.followGroupId === 'string'
        ? pagination.followGroupId.trim()
        : '';
      const explicitFinalIds = stringArray(pagination.finalElementIds);
      const finalElementIds = explicitFinalIds ?? (legacyGroupId
        ? elements
          .filter(candidate =>
            isRecord(candidate)
            && candidate.groupId === legacyGroupId
            && candidate.type !== 'table'
            && typeof candidate.id === 'string'
          )
          .map(candidate => (candidate as { id: string }).id)
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
      (element as { props: JsonRecord }).props.pagination = {
        ...rest,
        finalElementIds,
        repeatElementIds,
        rowMode,
        minRowsOnLastPage,
        gapAfterTable,
      };
    }
  }
  return migrated as T;
}
