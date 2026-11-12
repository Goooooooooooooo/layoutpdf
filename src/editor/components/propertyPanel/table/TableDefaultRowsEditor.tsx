import { useState } from 'react';
import type { TableColumn, TableValueRow } from '@/engine/renderTree/model.js';
import { createId } from '@/engine/core/document.js';
import { appendTableRow, removeTableRow, updateTableCell } from '@/editor/utils/tableInput.js';
import { StructuredField } from '@/editor/components/propertyPanel/PropertyField.js';
import IconButton from '@/ui/button/IconButton.js';
import Button from '@/ui/button/Button.js';
import Icon from '@/ui/icon/Icon.js';
import { t } from '@/i18n/index.js';

export default function TableDefaultRowsEditor({
  rows,
  columns,
  disabled,
  onChange,
}: {
  rows: TableValueRow[];
  columns: TableColumn[];
  disabled: boolean;
  onChange(rows: TableValueRow[]): void;
}) {
  const [selectedRowId, setSelectedRowId] = useState<string>();
  const row = rows.find(candidate => candidate.id === selectedRowId) ?? rows[0];
  const rowIndex = row ? rows.findIndex(candidate => candidate.id === row.id) : -1;

  return (
    <div className="layoutpdf-structured-editor">
      <p className="layoutpdf-panel-note">{t('property.table.defaultRowsNote')}</p>
      <div
        className="layoutpdf-table-list"
        role="listbox"
        aria-label={t('property.table.sectionDefaultRows')}
      >
        {rows.map((item, itemIndex) => {
          const summary = columns
            .filter(column => column.valueType !== 'formula')
            .map(column => String(item[column.key] ?? '').trim())
            .filter(Boolean)
            .slice(0, 2)
            .join(' · ');
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={row?.id === item.id}
              className="layoutpdf-table-list-item"
              data-active={row?.id === item.id || undefined}
              disabled={disabled}
              onClick={() => setSelectedRowId(item.id)}
            >
              <span>{itemIndex + 1}. {summary || t('property.table.emptyDefaultRow')}</span>
              <small>{columns.length} {t('property.table.sectionColumns')}</small>
            </button>
          );
        })}
      </div>
      {row && rowIndex >= 0 ? (
        <div className="layoutpdf-table-list-detail layoutpdf-default-row-detail">
          <div className="layoutpdf-default-row-fields">
            {columns.map(column => (
              <StructuredField key={column.id} label={column.label}>
                {column.valueType === 'formula' ? (
                  <output title={t('property.table.formulaComputed')}>
                    {t('property.table.formulaComputed')}
                  </output>
                ) : (
                  <input
                    aria-label={`${t('property.table.sectionDefaultRows')} ${rowIndex + 1} ${column.label}`}
                    type={column.valueType === 'date'
                      ? 'date'
                      : column.valueType === 'number' || column.valueType === 'currency'
                        ? 'number'
                        : 'text'}
                    value={String(row[column.key] ?? '')}
                    disabled={disabled}
                    placeholder={column.label}
                    onChange={event => onChange(updateTableCell(
                      rows,
                      rowIndex,
                      column.key,
                      event.currentTarget.value,
                      column.valueType,
                    ))}
                  />
                )}
              </StructuredField>
            ))}
          </div>
          <div className="layoutpdf-default-row-actions">
            <IconButton
              size="sm"
              variant="danger"
              title={t('property.table.deleteDefaultRow', { index: rowIndex + 1 })}
              aria-label={t('property.table.deleteDefaultRow', { index: rowIndex + 1 })}
              disabled={disabled}
              onClick={() => onChange(removeTableRow(rows, rowIndex))}
            >
              <Icon name="trash" size={14} />
            </IconButton>
          </div>
        </div>
      ) : null}
      <Button size="compact" disabled={disabled} onClick={() => {
        const id = createId('row');
        setSelectedRowId(id);
        onChange(appendTableRow(rows, columns, id));
      }}>
        <Icon name="plus" size={14} /> {t('property.table.addDefaultRow')}
      </Button>
    </div>
  );
}
