import type { TableColumn, TableValueRow } from '@/engine/renderTree/model.js';

let fallbackRowId = 0;

export function createTableRowId(rows: TableValueRow[] = []): string {
  const used = new Set(rows.map(row => row.id).filter((id): id is string => Boolean(id?.trim())));
  let candidate = '';
  do {
    fallbackRowId += 1;
    candidate = `row_${Date.now().toString(36)}_${fallbackRowId.toString(36)}`;
  } while (used.has(candidate));
  return candidate;
}

export function ensureTableRowIds(rows: TableValueRow[]): TableValueRow[] {
  const used = new Set<string>();
  let changed = false;
  const next = rows.map(row => {
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (id && !used.has(id)) {
      used.add(id);
      return row;
    }
    changed = true;
    let candidate = '';
    do {
      fallbackRowId += 1;
      candidate = `row_${Date.now().toString(36)}_${fallbackRowId.toString(36)}`;
    } while (used.has(candidate));
    used.add(candidate);
    return { ...row, id: candidate };
  });
  return changed ? next : rows;
}

export function updateTableCell(
  rows: TableValueRow[],
  rowIndex: number,
  key: string,
  rawValue: string,
  valueType: TableColumn['valueType'],
): TableValueRow[] {
  if (!rows[rowIndex] || valueType === 'formula') return rows;
  let value: string | number = rawValue;
  if ((valueType === 'number' || valueType === 'currency') && rawValue !== '') {
    const parsed = Number(rawValue);
    value = Number.isFinite(parsed) ? parsed : rawValue;
  }
  return rows.map((row, index) => index === rowIndex ? { ...row, [key]: value } : { ...row });
}

export function appendTableRow(
  rows: TableValueRow[],
  columns: TableColumn[],
  id: string,
): TableValueRow[] {
  const row: TableValueRow = { id };
  for (const column of columns) {
    if (column.valueType !== 'formula') row[column.key] = '';
  }
  return [...rows.map(item => ({ ...item })), row];
}

export function removeTableRow(rows: TableValueRow[], rowIndex: number): TableValueRow[] {
  return rows.filter((_, index) => index !== rowIndex).map(row => ({ ...row }));
}
