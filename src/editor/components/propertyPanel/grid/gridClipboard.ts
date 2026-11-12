import type { GridCell } from '@/engine/renderTree/model.js';
import { buildGridCoverage, cloneGridCell, type GridData, type GridVisualRange } from './gridEditing.js';

function serializeTsvField(value: string): string {
  return /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function serializeGridRange(data: GridData, range: GridVisualRange): string {
  const coverage = buildGridCoverage(data);
  const lines: string[] = [];
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    const values: string[] = [];
    for (let column = range.startColumn; column <= range.endColumn; column += 1) {
      const item = data.columns[column];
      if (!item || row < 0 || row >= data.rows.length) {
        values.push('');
        continue;
      }
      const slot = `${row}:${item.key}`;
      const anchor = coverage.get(slot) ?? slot;
      values.push(serializeTsvField(anchor === slot ? (data.cells[anchor]?.content ?? '') : ''));
    }
    lines.push(values.join('\t'));
  }
  return lines.join('\n');
}

export function parseGridTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let endedWithRowDelimiter = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      endedWithRowDelimiter = false;
    } else if (character === '"' && field === '') {
      quoted = true;
      endedWithRowDelimiter = false;
    } else if (character === '\t') {
      row.push(field);
      field = '';
      endedWithRowDelimiter = false;
    } else if (character === '\n' || character === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      endedWithRowDelimiter = true;
      if (character === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      field += character;
      endedWithRowDelimiter = false;
    }
  }
  if (row.length > 0 || field !== '' || rows.length === 0 || !endedWithRowDelimiter) {
    row.push(field);
    rows.push(row);
  }
  const width = Math.max(1, ...rows.map(row => row.length));
  return rows.map(row => [...row, ...Array.from({ length: width - row.length }, () => '')]);
}

export function pasteGridTsv(
  data: GridData,
  start: { row: number; column: number },
  values: readonly (readonly string[])[],
): GridData {
  if (!Number.isInteger(start.row) || !Number.isInteger(start.column) || start.row < 0 || start.column < 0) {
    throw new Error('Grid paste target is outside the available rows or columns.');
  }
  const coverage = buildGridCoverage(data);
  const cells: Record<string, GridCell> = { ...data.cells };
  for (let rowOffset = 0; rowOffset < values.length; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < (values[rowOffset]?.length ?? 0); columnOffset += 1) {
      const row = start.row + rowOffset;
      const column = start.column + columnOffset;
      const item = data.columns[column];
      if (!item || row >= data.rows.length) throw new Error('Grid paste target is outside the available rows or columns.');
      const slot = `${row}:${item.key}`;
      const anchor = coverage.get(slot) ?? slot;
      const cell = data.cells[anchor];
      if (anchor !== slot || (cell?.rowSpan ?? 1) > 1 || (cell?.columnSpan ?? 1) > 1) {
        throw new Error(`Grid paste intersects merged cell ${anchor}.`);
      }
      cells[slot] = { ...cloneGridCell(cell), content: values[rowOffset][columnOffset] };
    }
  }
  return { columns: data.columns, rows: data.rows, cells };
}
