import type { TablePaginationOptions } from '@/engine/renderTree/model.js';
import { TABLE_PAGINATION_DEFAULTS } from '@/engine/core/tablePaginationPolicy.js';

/** Normalize raw/legacy props without relying on a schema transform mutating the TemplateFile. */
export function normalizeTablePaginationOptions(
  value: Partial<TablePaginationOptions> | undefined,
): TablePaginationOptions {
  const title = value?.continuation?.title?.trim();
  const continuation = value?.continuation
    ? {
        ...(title ? { title } : {}),
        showFragmentIndex: value.continuation.showFragmentIndex ?? false,
      }
    : undefined;
  return {
    finalElementIds: [...(value?.finalElementIds ?? TABLE_PAGINATION_DEFAULTS.finalElementIds)],
    repeatElementIds: [...(value?.repeatElementIds ?? TABLE_PAGINATION_DEFAULTS.repeatElementIds)],
    rowMode: value?.rowMode ?? TABLE_PAGINATION_DEFAULTS.rowMode,
    minRowsOnLastPage: value?.minRowsOnLastPage ?? TABLE_PAGINATION_DEFAULTS.minRowsOnLastPage,
    gapAfterTable: value?.gapAfterTable ?? TABLE_PAGINATION_DEFAULTS.gapAfterTable,
    ...(continuation ? { continuation } : {}),
  };
}

/** One authoritative default shared by new tables, legacy fallback, and the property editor. */
export function createDefaultTablePaginationOptions(): TablePaginationOptions {
  return normalizeTablePaginationOptions(undefined);
}
