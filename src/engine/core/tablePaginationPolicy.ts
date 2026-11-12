export const TABLE_PAGINATION_DEFAULTS = {
  finalElementIds: [] as readonly string[],
  repeatElementIds: [] as readonly string[],
  rowMode: 'compact' as const,
  minRowsOnLastPage: 1,
  gapAfterTable: 3,
};

export const TABLE_PAGINATION_LIMITS = {
  maxElementReferences: 2_000,
  minRowsOnLastPage: { min: 1, max: 2_000 },
  gapAfterTable: { min: 0, max: 1_000 },
} as const;
