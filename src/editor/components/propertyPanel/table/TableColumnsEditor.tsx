import { useState } from 'react';
import type { TableColumn } from '@/engine/renderTree/model.js';
import { createId } from '@/engine/core/document.js';
import {
  getFormulaSourceColumns,
  isValidTableColumnFormula,
  moveTableColumn,
} from '@/editor/utils/tablePropertyOptions.js';
import {
  defaultCellAlign,
  defaultHeaderAlign,
  resolveHeaderAlign,
} from '@/engine/renderTree/tableAlign.js';
import { StructuredField } from '@/editor/components/propertyPanel/PropertyField.js';
import Button from '@/ui/button/Button.js';
import IconButton from '@/ui/button/IconButton.js';
import Icon from '@/ui/icon/Icon.js';
import Select from '@/ui/select/Select.js';
import { t, type MessageKey } from '@/i18n/index.js';
import TableNumericFormatEditor from '@/editor/components/propertyPanel/table/TableNumericFormatEditor.js';
import { NumberInput, TextInput } from '@/ui/input/Input.js';
import MenuButton from '@/ui/menuButton/MenuButton.js';
import FormulaEditorDialogField from '@/editor/components/propertyPanel/FormulaEditorDialogField.js';
import type { FormulaReferenceOption } from '@/editor/components/propertyPanel/FormulaExpressionInput.js';

function updateColumn(
  columns: TableColumn[],
  index: number,
  patch: Partial<TableColumn>,
): TableColumn[] {
  return columns.map((column, current) => current === index ? { ...column, ...patch } : column);
}

function columnAria(index: number, label: string): string {
  return t('property.table.columnControlAria', { index: index + 1, label });
}

const COLUMN_TYPE_LABEL_KEYS: Record<TableColumn['valueType'], MessageKey> = {
  text: 'property.option.tableText',
  number: 'property.option.tableNumber',
  currency: 'property.option.tableCurrency',
  date: 'property.option.tableDate',
  formula: 'property.option.tableFormula',
};

export default function TableColumnsEditor({
  columns,
  externalReferences,
  disabled,
  onChange,
}: {
  columns: TableColumn[];
  externalReferences: FormulaReferenceOption[];
  disabled: boolean;
  onChange(columns: TableColumn[]): void;
}) {
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const activeColumn = columns.find(column => column.id === selectedColumnId) ?? columns[0];
  const index = activeColumn ? columns.findIndex(column => column.id === activeColumn.id) : -1;
  const column = activeColumn;

  return (
    <div className="layoutpdf-structured-editor">
      <div className="layoutpdf-table-list" role="list" aria-label={t('property.table.sectionColumns')}>
        {columns.map((item, itemIndex) => (
          <div key={item.id} className="layoutpdf-table-list-row" role="listitem">
            <button
              type="button"
              className="layoutpdf-table-list-item"
              aria-pressed={column?.id === item.id}
              data-active={column?.id === item.id || undefined}
              disabled={disabled}
              onClick={() => setSelectedColumnId(item.id)}
            >
              <span>{itemIndex + 1}. {item.label || item.key}</span>
              <small>{t(COLUMN_TYPE_LABEL_KEYS[item.valueType])} · {item.width}</small>
            </button>
            <span className="layoutpdf-table-list-actions">
              <IconButton
                size="sm"
                title={t('property.table.moveColumnUp', { index: itemIndex + 1 })}
                aria-label={t('property.table.moveColumnUp', { index: itemIndex + 1 })}
                disabled={disabled || itemIndex === 0}
                onClick={() => onChange(moveTableColumn(columns, itemIndex, itemIndex - 1))}
              >
                <Icon name="arrow-up" size={14} />
              </IconButton>
              <IconButton
                size="sm"
                title={t('property.table.moveColumnDown', { index: itemIndex + 1 })}
                aria-label={t('property.table.moveColumnDown', { index: itemIndex + 1 })}
                disabled={disabled || itemIndex === columns.length - 1}
                onClick={() => onChange(moveTableColumn(columns, itemIndex, itemIndex + 1))}
              >
                <Icon name="arrow-down" size={14} />
              </IconButton>
            </span>
          </div>
        ))}
      </div>
      {column && index >= 0 ? (
        <div className="layoutpdf-table-list-detail layoutpdf-column-row">
          <div className="layoutpdf-column-line l1">
            <StructuredField label={t('property.table.columnTitle')}>
              <TextInput
                aria-label={columnAria(index, t('property.table.columnTitleShort'))}
                value={column.label}
                disabled={disabled}
                onValueChange={label => onChange(updateColumn(columns, index, { label }))}
              />
            </StructuredField>
            <StructuredField label={t('property.table.columnField')}>
              <TextInput
                aria-label={columnAria(index, t('property.table.columnField'))}
                value={column.key}
                disabled={disabled}
                onValueChange={key => onChange(updateColumn(columns, index, { key }))}
              />
            </StructuredField>
          </div>
          <div className="layoutpdf-column-line l2">
            <StructuredField label={t('property.table.columnType')}>
              <Select
                aria-label={columnAria(index, t('property.table.columnTypeShort'))}
                value={column.valueType}
                disabled={disabled}
                onChange={value => {
                  const valueType = value as TableColumn['valueType'];
                  const next = columns.map(item => ({ ...item }));
                  const previousValueType = next[index].valueType;
                  if (next[index].align === defaultCellAlign(previousValueType)) {
                    next[index].align = defaultCellAlign(valueType);
                  }
                  next[index].valueType = valueType;
                  next[index].headerAlign = next[index].headerAlign ?? defaultHeaderAlign();
                  if (valueType === 'formula') {
                    const currentFormula = column.formula as {
                      kind?: unknown;
                      expression?: unknown;
                    } | undefined;
                    next[index].formula = (
                      currentFormula?.kind === 'expression'
                      && typeof currentFormula.expression === 'string'
                    )
                      ? { kind: 'expression', expression: currentFormula.expression }
                      : {
                        kind: 'expression',
                        expression: columns[index - 1] ? `row.${columns[index - 1].key}` : '0',
                      };
                  } else {
                    delete next[index].formula;
                  }
                  onChange(next);
                }}
                options={[
                  { value: 'text', label: t('property.option.tableText') },
                  { value: 'number', label: t('property.option.tableNumber') },
                  { value: 'currency', label: t('property.option.tableCurrency') },
                  { value: 'date', label: t('property.option.tableDate') },
                  { value: 'formula', label: t('property.option.tableFormula') },
                ]}
              />
            </StructuredField>
            <StructuredField label={t('property.table.columnWidth')}>
              <NumberInput
                aria-label={columnAria(index, t('property.table.columnWidth'))}
                min={0.1}
                step={0.1}
                value={column.width}
                disabled={disabled}
                onValueChange={width => {
                  if (width !== null) onChange(updateColumn(columns, index, { width }));
                }}
              />
            </StructuredField>
            <StructuredField label={t('property.table.columnHeaderAlign')}>
              <Select
                aria-label={columnAria(index, t('property.table.columnHeaderAlign'))}
                value={resolveHeaderAlign(column)}
                disabled={disabled}
                onChange={value => onChange(updateColumn(columns, index, {
                  headerAlign: value as TableColumn['align'],
                }))}
                options={[
                  { value: 'left', label: t('property.option.tableHeaderLeft') },
                  { value: 'center', label: t('property.option.tableHeaderCenter') },
                  { value: 'right', label: t('property.option.tableHeaderRight') },
                ]}
              />
            </StructuredField>
            <StructuredField label={t('property.table.columnContentAlign')}>
              <Select
                aria-label={columnAria(index, t('property.table.columnContentAlign'))}
                value={column.align}
                disabled={disabled}
                onChange={value => onChange(updateColumn(columns, index, {
                  align: value as TableColumn['align'],
                }))}
                options={[
                  { value: 'left', label: t('property.option.tableContentLeft') },
                  { value: 'center', label: t('property.option.tableContentCenter') },
                  { value: 'right', label: t('property.option.tableContentRight') },
                ]}
              />
            </StructuredField>
          </div>
          {column.valueType === 'formula' && column.formula ? (
            <div className="layoutpdf-column-line l3">
              <FormulaEditorDialogField
                label={t('property.table.columnFormula')}
                ariaLabel={columnAria(index, t('property.formula.inputAria'))}
                value={column.formula.expression}
                disabled={disabled}
                references={[
                  ...getFormulaSourceColumns(columns, index).map(source => ({
                    token: `row.${source.key}`,
                    label: source.label,
                  })),
                  ...externalReferences,
                ]}
                functions={[
                  'RUNNING_SUM',
                  'ROW_NUMBER',
                  'SUM',
                  'AVERAGE',
                  'MIN',
                  'MAX',
                  'ROUND',
                  'ROUNDUP',
                  'ROUNDDOWN',
                  'FLOOR',
                  'CEIL',
                  'PERCENT',
                  'ABS',
                  'IF',
                ]}
                validateDraft={draft => isValidTableColumnFormula(columns, index, draft)}
                onChange={expression => onChange(updateColumn(columns, index, {
                  formula: { kind: 'expression', expression },
                }))}
              />
            </div>
          ) : null}
          {['number', 'currency', 'formula'].includes(column.valueType) ? (
            <TableNumericFormatEditor
              value={column.numericFormat}
              disabled={disabled}
              ariaSuffix={String(index + 1)}
              defaultPrefix={column.valueType === 'currency' ? '¥' : ''}
              decimalPlaces={column.decimalPlaces}
              onDecimalPlacesChange={decimalPlaces => onChange(updateColumn(columns, index, { decimalPlaces }))}
              onChange={numericFormat => onChange(updateColumn(columns, index, { numericFormat }))}
            />
          ) : null}
          <div className="layoutpdf-column-line l4">
            <MenuButton
              label={t('property.table.columnActions', { index: index + 1 })}
              disabled={disabled}
              items={[
                {
                  id: 'previous',
                  label: t('property.table.moveColumnPrevious', { index: index + 1 }),
                  disabled: index === 0,
                  onClick: () => onChange(moveTableColumn(columns, index, index - 1)),
                },
                {
                  id: 'next',
                  label: t('property.table.moveColumnNext', { index: index + 1 }),
                  disabled: index === columns.length - 1,
                  onClick: () => onChange(moveTableColumn(columns, index, index + 1)),
                },
                { id: 'separator', label: '', divider: true },
                {
                  id: 'delete',
                  label: t('property.table.deleteColumn', { index: index + 1 }),
                  disabled: columns.length === 1,
                  danger: true,
                  onClick: () => onChange(columns.filter((_, current) => current !== index)),
                },
              ]}
            />
          </div>
        </div>
      ) : null}
      <Button size="compact" disabled={disabled} onClick={() => {
          const valueType: TableColumn['valueType'] = 'text';
          const id = createId('col');
          setSelectedColumnId(id);
          onChange([...columns, {
            id,
            label: t('property.table.newColumn'),
            key: t('property.table.newField', { index: columns.length + 1 }),
            width: 1,
            valueType,
            align: defaultCellAlign(valueType),
            headerAlign: defaultHeaderAlign(),
          }]);
        }}
      >
        <Icon name="plus" size={14} /> {t('property.table.addColumn')}
      </Button>
    </div>
  );
}
