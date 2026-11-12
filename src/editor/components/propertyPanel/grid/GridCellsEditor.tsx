import { useState } from 'react';
import type { GridCell, GridColumn, GridRow } from '@/engine/renderTree/model.js';
import IconButton from '@/ui/button/IconButton.js';
import Button from '@/ui/button/Button.js';
import Icon from '@/ui/icon/Icon.js';
import Select from '@/ui/select/Select.js';
import { NumberInput } from '@/ui/input/Input.js';
import { StructuredField } from '@/editor/components/propertyPanel/PropertyField.js';
import { t } from '@/i18n/index.js';
import { TEMPLATE_COMPLEXITY_LIMITS } from '@/engine/utils/limits.js';
import { createId } from '@/engine/core/document.js';
import {
  addGridColumn,
  addGridRow,
  cloneGridCell,
  deleteGridColumn,
  deleteGridRow,
} from './gridEditing.js';

interface GridCellsEditorProps {
  columns: GridColumn[];
  rows: GridRow[];
  cells: Record<string, GridCell>;
  disabled: boolean;
  onChange: (next: { columns: GridColumn[]; rows: GridRow[]; cells: Record<string, GridCell> }) => void;
}

export default function GridCellsEditor(props: GridCellsEditorProps) {
  const { columns, rows, cells, disabled, onChange } = props;
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState('');
  const hasMergedCells = Object.values(cells).some(cell => (cell.columnSpan ?? 1) > 1 || (cell.rowSpan ?? 1) > 1);
  const cellCount = Object.keys(cells).length;
  const canAddRow = rows.length < TEMPLATE_COMPLEXITY_LIMITS.maxGridRowsPerElement
    && cellCount + columns.length <= TEMPLATE_COMPLEXITY_LIMITS.maxGridCellsPerElement;
  const canAddColumn = columns.length < TEMPLATE_COMPLEXITY_LIMITS.maxGridColumnsPerElement
    && cellCount + rows.length <= TEMPLATE_COMPLEXITY_LIMITS.maxGridCellsPerElement;

  const setCell = (rowIndex: number, colKey: string, partial: Partial<GridCell>) => {
    const key = `${rowIndex}:${colKey}`;
    const next = { ...cells, [key]: { ...cloneGridCell(cells[key]), ...partial } };
    onChange({ columns, rows, cells: next });
  };

  const addRow = () => {
    onChange(addGridRow({ columns, rows, cells }, createId));
  };

  const setRowHeight = (index: number, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    onChange({
      columns,
      rows: rows.map((row, current) => current === index ? { ...row, height } : { ...row }),
      cells,
    });
  };

  const setColumnWidth = (index: number, width: number) => {
    if (!Number.isFinite(width) || width <= 0) return;
    onChange({
      columns: columns.map((column, current) => current === index ? { ...column, width } : { ...column }),
      rows,
      cells,
    });
  };

  const setCellSpan = (rowIndex: number, columnIndex: number, columnSpan: number, rowSpan: number) => {
    const column = columns[columnIndex];
    const key = `${rowIndex}:${column.key}`;
    const current = cloneGridCell(cells[key]);
    const previousColumnSpan = current.columnSpan ?? 1;
    const previousRowSpan = current.rowSpan ?? 1;
    const nextColumnSpan = Math.max(1, Math.min(columnSpan, columns.length - columnIndex));
    const nextRowSpan = Math.max(1, Math.min(rowSpan, rows.length - rowIndex));
    const nextCells = { ...cells };

    for (let rowOffset = 0; rowOffset < nextRowSpan; rowOffset++) {
      for (let columnOffset = 0; columnOffset < nextColumnSpan; columnOffset++) {
        if (rowOffset < previousRowSpan && columnOffset < previousColumnSpan) continue;
        const covered = cells[`${rowIndex + rowOffset}:${columns[columnIndex + columnOffset].key}`];
        if (covered?.content.trim()) {
          setMergeError(t('property.grid.mergeRequiresEmptyCells'));
          return;
        }
      }
    }
    setMergeError('');

    for (let rowOffset = 0; rowOffset < previousRowSpan; rowOffset++) {
      for (let columnOffset = 0; columnOffset < previousColumnSpan; columnOffset++) {
        if (rowOffset < nextRowSpan && columnOffset < nextColumnSpan) continue;
        const restoredKey = `${rowIndex + rowOffset}:${columns[columnIndex + columnOffset].key}`;
        nextCells[restoredKey] ??= { content: '', role: 'body', align: 'left' };
      }
    }
    for (let rowOffset = 0; rowOffset < nextRowSpan; rowOffset++) {
      for (let columnOffset = 0; columnOffset < nextColumnSpan; columnOffset++) {
        if (rowOffset === 0 && columnOffset === 0) continue;
        delete nextCells[`${rowIndex + rowOffset}:${columns[columnIndex + columnOffset].key}`];
      }
    }
    nextCells[key] = {
      ...current,
      columnSpan: nextColumnSpan === 1 ? undefined : nextColumnSpan,
      rowSpan: nextRowSpan === 1 ? undefined : nextRowSpan,
    };
    onChange({ columns, rows, cells: nextCells });
  };

  const deleteRow = (index: number) => {
    onChange(deleteGridRow({ columns, rows, cells }, index));
  };

  const addColumn = () => {
    onChange(addGridColumn({ columns, rows, cells }, createId));
  };

  const deleteColumn = (index: number) => {
    onChange(deleteGridColumn({ columns, rows, cells }, index));
  };

  const toggleBorder = (rowIndex: number, colKey: string, side: 'top' | 'bottom' | 'left' | 'right') => {
    const key = `${rowIndex}:${colKey}`;
    const cell = cells[key];
    const current = cell?.borders?.[side];
    const nextBorder = { ...(cell?.borders ?? {}), [side]: !current };
    setCell(rowIndex, colKey, { borders: nextBorder as GridCell['borders'] });
  };

  const setBgColor = (rowIndex: number, colKey: string, color: string) => {
    setCell(rowIndex, colKey, { backgroundColor: color || undefined });
  };

  return (
    <div className="layoutpdf-grid-editor">
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
        <IconButton size="sm" disabled={disabled || !canAddRow} onClick={addRow} title={t('property.grid.addRow')}>
          <Icon name="plus" size={12} />
        </IconButton>
        <span style={{ fontSize: 12 }}>{t('property.grid.addRow')}</span>
        <IconButton size="sm" disabled={disabled || !canAddColumn} onClick={addColumn} title={t('property.grid.addColumn')}>
          <Icon name="plus" size={12} />
        </IconButton>
        <span style={{ fontSize: 12 }}>{t('property.grid.addColumn')}</span>
        <span style={{ fontSize: 10, color: 'var(--layoutpdf-color-text-muted)', marginLeft: 8 }}>{t('property.grid.editorHint')}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: 4, border: '1px solid #ddd', minWidth: 30 }}></th>
              {columns.map((col, ci) => (
                <th key={col.id} style={{ padding: 4, border: '1px solid #ddd', minWidth: 60 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span>{col.key.toUpperCase()}</span>
                    <NumberInput
                      aria-label={t('property.grid.columnWidth', { column: col.key.toUpperCase() })}
                      min={0.1}
                      step={0.1}
                      value={col.width}
                      disabled={disabled}
                      onValueChange={width => {
                        if (width !== null) setColumnWidth(ci, width);
                      }}
                      style={{ width: 46 }}
                    />
                    <IconButton size="sm" disabled={disabled || columns.length <= 1 || hasMergedCells} onClick={() => deleteColumn(ci)} title={t('property.grid.deleteColumn')}>
                      <Icon name="trash" size={10} />
                    </IconButton>
                  </div>
                </th>
              ))}
              <td style={{ padding: 2, border: '1px solid #ddd', minWidth: 30 }}>
                <IconButton size="sm" disabled={disabled || !canAddColumn} onClick={addColumn} title={t('property.grid.addColumn')}>
                  <Icon name="plus" size={12} />
                </IconButton>
              </td>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.id}>
                <td style={{ padding: 2, border: '1px solid #ddd', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span>{ri + 1}</span>
                    <NumberInput
                      aria-label={t('property.grid.rowHeight', { row: ri + 1 })}
                      min={1}
                      step={0.5}
                      value={row.height ?? null}
                      placeholder="—"
                      disabled={disabled}
                      onValueChange={height => {
                        if (height !== null) setRowHeight(ri, height);
                      }}
                      style={{ width: 42 }}
                    />
                    <IconButton size="sm" disabled={disabled || rows.length <= 1 || hasMergedCells} onClick={() => deleteRow(ri)} title={t('property.grid.deleteRow')}>
                      <Icon name="trash" size={10} />
                    </IconButton>
                  </div>
                </td>
                {columns.map((col, ci) => {
                  const key = `${ri}:${col.key}`;
                  const cell = cells[key];
                  const isFirstCol = ci === 0;
                  const isLastCol = ci === columns.length - 1;
                  const isSelected = selectedCell === key;
                  if (!cell) return <td key={key} style={{ padding: 2, border: '1px solid #ddd' }}></td>;
                  return (
                    <td
                      key={key}
                      style={{
                        padding: 2,
                        border: isSelected ? '2px solid #1677ff' : '1px solid #ddd',
                        background: cell.backgroundColor,
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        setSelectedCell(key);
                        setMergeError('');
                      }}
                    >
                      <input
                        type="text"
                        value={cell.content}
                        disabled={disabled}
                        placeholder={t('property.grid.contentPlaceholder')}
                        style={{
                          width: '100%',
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          fontWeight: cell.bold ? 'bold' : 'normal',
                          color: cell.role === 'header' ? '#000' : '#333',
                          fontSize: 11,
                        }}
                        onChange={e => setCell(ri, col.key, { content: e.target.value })}
                      />
                      {isSelected && (
                        <div style={{ display: 'flex', gap: 2, marginTop: 2, flexWrap: 'wrap' }}>
                          <Button
                            size="compact"
                            disabled={disabled}
                            onClick={() => toggleBorder(ri, col.key, 'top')}
                            style={{
                              width: 16, height: 16, padding: 0, fontSize: 9,
                              border: '1px solid #ccc', background: cell.borders?.top ?? true ? '#e8e8e8' : '#fff',
                              cursor: 'pointer',
                            }}
                            title={t('property.grid.toggleTopBorder')}
                          >
                            T
                          </Button>
                          <Button
                            size="compact"
                            disabled={disabled}
                            onClick={() => toggleBorder(ri, col.key, 'bottom')}
                            style={{
                              width: 16, height: 16, padding: 0, fontSize: 9,
                              border: '1px solid #ccc', background: cell.borders?.bottom ?? true ? '#e8e8e8' : '#fff',
                              cursor: 'pointer',
                            }}
                            title={t('property.grid.toggleBottomBorder')}
                          >
                            B
                          </Button>
                          <Button
                            size="compact"
                            disabled={disabled}
                            onClick={() => toggleBorder(ri, col.key, 'left')}
                            style={{
                              width: 16, height: 16, padding: 0, fontSize: 9,
                              border: '1px solid #ccc', background: cell.borders?.left ?? isFirstCol ? '#e8e8e8' : '#fff',
                              cursor: 'pointer',
                            }}
                            title={t('property.grid.toggleLeftBorder')}
                          >
                            L
                          </Button>
                          <Button
                            size="compact"
                            disabled={disabled}
                            onClick={() => toggleBorder(ri, col.key, 'right')}
                            style={{
                              width: 16, height: 16, padding: 0, fontSize: 9,
                              border: '1px solid #ccc', background: cell.borders?.right ?? isLastCol ? '#e8e8e8' : '#fff',
                              cursor: 'pointer',
                            }}
                            title={t('property.grid.toggleRightBorder')}
                          >
                            R
                          </Button>
                          <input
                            type="color"
                            value={cell.backgroundColor ?? '#ffffff'}
                            disabled={disabled}
                            onChange={e => setBgColor(ri, col.key, e.target.value)}
                            style={{ width: 16, height: 16, padding: 0, border: '1px solid #ccc', cursor: 'pointer' }}
                            title={t('property.grid.backgroundColor')}
                          />
                          {cell.backgroundColor && (
                            <IconButton
                              size="sm"
                              disabled={disabled}
                              onClick={() => setBgColor(ri, col.key, '')}
                              style={{
                                width: 16, height: 16, padding: 0, fontSize: 8,
                                border: '1px solid #ccc', background: '#fff',
                                cursor: 'pointer', color: '#999',
                              }}
                              title={t('property.grid.clearBackgroundColor')}
                            >
                              <Icon name="x" size={10} />
                            </IconButton>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedCell && cells[selectedCell] ? (() => {
        const [rawRowIndex, columnKey] = selectedCell.split(':');
        const rowIndex = Number(rawRowIndex);
        const columnIndex = columns.findIndex(column => column.key === columnKey);
        const cell = cells[selectedCell];
        return (
          <div className="layoutpdf-column-row">
            <div className="layoutpdf-section-label">{t('property.grid.selectedCell', { cell: `${columnKey.toUpperCase()}${rowIndex + 1}` })}</div>
            {mergeError ? <div className="layoutpdf-field-error" role="alert">{mergeError}</div> : null}
            <div className="layoutpdf-column-line l2">
              <StructuredField label={t('property.grid.role')}>
                <Select
                  value={cell.role}
                  disabled={disabled}
                  onChange={value => setCell(rowIndex, columnKey, { role: value as GridCell['role'] })}
                  options={[
                    { value: 'header', label: t('property.grid.roleHeader') },
                    { value: 'body', label: t('property.grid.roleBody') },
                    { value: 'footer', label: t('property.grid.roleFooter') },
                  ]}
                />
              </StructuredField>
              <StructuredField label={t('property.common.fontSize')}>
                <NumberInput min={6} max={72} value={cell.fontSize ?? null} placeholder="—" disabled={disabled}
                  onValueChange={fontSize => setCell(rowIndex, columnKey, {
                    fontSize: fontSize ?? undefined,
                  })} />
              </StructuredField>
            </div>
            <div className="layoutpdf-column-line l2">
              <StructuredField label={t('property.common.horizontalAlign')}>
                <Select value={cell.align ?? 'left'} disabled={disabled}
                  onChange={value => setCell(rowIndex, columnKey, { align: value as GridCell['align'] })}
                  options={[
                    { value: 'left', label: t('property.option.alignLeft') },
                    { value: 'center', label: t('property.option.alignCenter') },
                    { value: 'right', label: t('property.option.alignRight') },
                  ]} />
              </StructuredField>
              <StructuredField label={t('property.common.verticalAlign')}>
                <Select value={cell.verticalAlign ?? 'middle'} disabled={disabled}
                  onChange={value => setCell(rowIndex, columnKey, { verticalAlign: value as GridCell['verticalAlign'] })}
                  options={[
                    { value: 'top', label: t('property.option.alignTop') },
                    { value: 'middle', label: t('property.option.alignMiddle') },
                    { value: 'bottom', label: t('property.option.alignBottom') },
                  ]} />
              </StructuredField>
            </div>
            <div className="layoutpdf-column-line l2">
              <StructuredField label={t('property.grid.columnSpan')}>
                <NumberInput min={1} max={columns.length - columnIndex} value={cell.columnSpan ?? 1} disabled={disabled}
                  onValueChange={columnSpan => {
                    if (columnSpan !== null) setCellSpan(rowIndex, columnIndex, columnSpan, cell.rowSpan ?? 1);
                  }} />
              </StructuredField>
              <StructuredField label={t('property.grid.rowSpan')}>
                <NumberInput min={1} max={rows.length - rowIndex} value={cell.rowSpan ?? 1} disabled={disabled}
                  onValueChange={rowSpan => {
                    if (rowSpan !== null) setCellSpan(rowIndex, columnIndex, cell.columnSpan ?? 1, rowSpan);
                  }} />
              </StructuredField>
            </div>
            <label className="layoutpdf-switch-field">
              <input type="checkbox" checked={cell.bold ?? false} disabled={disabled}
                onChange={event => setCell(rowIndex, columnKey, { bold: event.currentTarget.checked })} />
              <span>{t('property.grid.bold')}</span>
            </label>
          </div>
        );
      })() : null}
    </div>
  );
}
