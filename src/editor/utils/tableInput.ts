import type { TableColumn, TableValueRow } from '@/engine/renderTree/model.js';

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
