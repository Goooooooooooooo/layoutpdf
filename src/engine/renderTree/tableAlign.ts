import type { TableColumn, TableColumnAlign } from '@/engine/renderTree/model.js';

export function defaultCellAlign(valueType: TableColumn['valueType']): TableColumnAlign {
  if (valueType === 'number' || valueType === 'currency' || valueType === 'formula') {
    return 'right';
  }

  if (valueType === 'date') {
    return 'center';
  }

  return 'left';
}

export function defaultHeaderAlign(): TableColumnAlign {
  return 'center';
}

export function resolveHeaderAlign(column: TableColumn): TableColumnAlign {
  return column.headerAlign ?? defaultHeaderAlign();
}
