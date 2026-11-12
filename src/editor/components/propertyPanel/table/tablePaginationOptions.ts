import type { TemplatePage } from '@/engine/core/document.js';
import { TABLE_PAGINATION_LIMITS } from '@/engine/core/tablePaginationPolicy.js';
import { readTablePaginationElementReferences } from '@/engine/core/tablePaginationReferences.js';
import { normalizeTablePaginationOptions } from '@/engine/renderTree/tablePaginationOptions.js';
import type { TableProps } from '@/plugins/table/table.js';

export type TablePaginationConfig = NonNullable<TableProps['pagination']>;
export type TablePaginationPatch = Partial<TablePaginationConfig>;

export { TABLE_PAGINATION_LIMITS };

export function normalizeTablePaginationNumber(
  field: 'minRowsOnLastPage' | 'gapAfterTable',
  value: number,
): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const limits = TABLE_PAGINATION_LIMITS[field];
  const normalized = field === 'minRowsOnLastPage' ? Math.round(value) : value;
  return Math.min(limits.max, Math.max(limits.min, normalized));
}

export function mergeTablePagination(
  current: TableProps['pagination'],
  patch: TablePaginationPatch,
): TablePaginationConfig {
  return normalizeTablePaginationOptions({
    finalElementIds: patch.finalElementIds ?? current?.finalElementIds ?? [],
    repeatElementIds: patch.repeatElementIds ?? current?.repeatElementIds ?? [],
    rowMode: patch.rowMode ?? current?.rowMode,
    minRowsOnLastPage: patch.minRowsOnLastPage ?? current?.minRowsOnLastPage,
    gapAfterTable: patch.gapAfterTable ?? current?.gapAfterTable,
    continuation: patch.continuation ?? current?.continuation,
  });
}

export interface PaginationGroupOption {
  groupId: string;
  elementIds: string[];
  memberNames: string[];
}

/** Editor groups are only a selection aid; persisted pagination keeps stable element ids. */
export function buildPaginationGroupOptions(
  page: Pick<TemplatePage, 'elements'> | undefined,
  tableElementId: string,
): PaginationGroupOption[] {
  if (!page) return [];
  const pageElements = new Map(page.elements.map(element => [element.id, element]));
  const finalOwners = new Map<string, string>();
  for (const element of page.elements) {
    if (element.type !== 'table' || element.id === tableElementId) continue;
    for (const elementId of readTablePaginationElementReferences(element).finalElementIds) {
      finalOwners.set(elementId, element.id);
    }
  }
  const groups = new Map<string, PaginationGroupOption>();
  for (const element of page.elements) {
    if (!element.groupId) continue;
    let option = groups.get(element.groupId);
    if (!option) {
      option = { groupId: element.groupId, elementIds: [], memberNames: [] };
      groups.set(element.groupId, option);
    }
    option.elementIds.push(element.id);
    option.memberNames.push(element.name || element.type);
  }
  return [...groups.values()].filter(option =>
    option.elementIds.length > 0
    && !option.elementIds.includes(tableElementId)
    && option.elementIds.every(elementId => {
      const element = pageElements.get(elementId);
      return element?.type !== 'table' && !finalOwners.has(elementId);
    })
  );
}

export function findMatchingPaginationGroup(
  groups: PaginationGroupOption[],
  elementIds: readonly string[],
): PaginationGroupOption | undefined {
  if (elementIds.length === 0) return undefined;
  const expected = new Set(elementIds);
  return groups.find(group =>
    group.elementIds.length === expected.size
    && group.elementIds.every(elementId => expected.has(elementId))
  );
}
