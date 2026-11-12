import type { TemplateElement, TemplatePage } from '@/engine/core/document.js';

export const TABLE_PAGINATION_REFERENCE_FIELDS = [
  'finalElementIds',
  'repeatElementIds',
] as const;

export type TablePaginationReferenceField = typeof TABLE_PAGINATION_REFERENCE_FIELDS[number];

function paginationRecord(element: TemplateElement<object>): Record<string, unknown> | undefined {
  if (element.type !== 'table') return undefined;
  const props = element.props as Record<string, unknown>;
  const pagination = props.pagination;
  return pagination && typeof pagination === 'object' && !Array.isArray(pagination)
    ? pagination as Record<string, unknown>
    : undefined;
}

export function readTablePaginationElementReferences(
  element: TemplateElement<object>,
): Record<TablePaginationReferenceField, string[]> {
  const pagination = paginationRecord(element);
  return Object.fromEntries(TABLE_PAGINATION_REFERENCE_FIELDS.map(field => [
    field,
    Array.isArray(pagination?.[field])
      ? pagination[field].filter((value): value is string => typeof value === 'string')
      : [],
  ])) as Record<TablePaginationReferenceField, string[]>;
}

/** Remap table-owned element references after cloning or copying a page subset. */
export function remapTablePaginationElementReferences(
  elements: TemplateElement<object>[],
  elementIds: ReadonlyMap<string, string>,
  options: { dropUnmapped?: boolean } = {},
): number {
  let removed = 0;
  for (const element of elements) {
    const pagination = paginationRecord(element);
    if (!pagination) continue;
    for (const field of TABLE_PAGINATION_REFERENCE_FIELDS) {
      const values = pagination[field];
      if (!Array.isArray(values)) continue;
      pagination[field] = values.flatMap(value => {
        if (typeof value !== 'string') return [value];
        const nextId = elementIds.get(value);
        if (nextId) return [nextId];
        if (!options.dropUnmapped) return [value];
        removed += 1;
        return [];
      });
    }
  }
  return removed;
}

/** Remove references to elements deleted from the same source page. */
export function removeTablePaginationElementReferences(
  page: Pick<TemplatePage, 'elements'>,
  shouldRemove: (elementId: string) => boolean,
): number {
  let removed = 0;
  for (const element of page.elements) {
    const pagination = paginationRecord(element);
    if (!pagination) continue;
    for (const field of TABLE_PAGINATION_REFERENCE_FIELDS) {
      const values = pagination[field];
      if (!Array.isArray(values)) continue;
      pagination[field] = values.filter(value => {
        const remove = typeof value === 'string' && shouldRemove(value);
        if (remove) removed += 1;
        return !remove;
      });
    }
  }
  return removed;
}
