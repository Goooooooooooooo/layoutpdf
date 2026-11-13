import { useState } from 'react';
import type { TableColumn, TableFooter } from '@/engine/renderTree/model.js';
import { createId } from '@/engine/core/document.js';
import { StructuredField } from '@/editor/components/propertyPanel/PropertyField.js';
import TableNumericFormatEditor from '@/editor/components/propertyPanel/table/TableNumericFormatEditor.js';
import {
  canReferenceTableFooter,
  moveTableFooter,
  tableFooterDependentIds,
  updateTableFooterOutputField,
} from '@/editor/utils/tablePropertyOptions.js';
import Button from '@/ui/button/Button.js';
import IconButton from '@/ui/button/IconButton.js';
import { ConfirmDialog } from '@/ui/dialog/Dialog.js';
import Disclosure from '@/ui/disclosure/Disclosure.js';
import Icon from '@/ui/icon/Icon.js';
import { CheckboxInput, NumberInput, TextInput } from '@/ui/input/Input.js';
import MenuButton from '@/ui/menuButton/MenuButton.js';
import Select from '@/ui/select/Select.js';
import { t } from '@/i18n/index.js';
import FormulaEditorDialogField from '@/editor/components/propertyPanel/FormulaEditorDialogField.js';
import type { FormulaReferenceOption } from '@/editor/components/propertyPanel/FormulaExpressionInput.js';
import { renameFormulaReferences } from '@/utils/calc.js';

function footerFormulaSummary(
  footer: TableFooter,
  footers: TableFooter[],
  columns: TableColumn[],
  externalReferences: FormulaReferenceOption[],
): string {
  if (typeof footer.formula?.expression !== 'string') {
    return t('property.formula.invalid');
  }
  const labels = new Map<string, string>([
    ...columns.map(column => [`column.${column.key}`, `【${column.label}】`] as const),
    ...footers.map(candidate => [`footer.${candidate.id}`, `【${candidate.label}】`] as const),
    ...externalReferences.map(reference => [reference.token, `【${reference.label}】`] as const),
  ]);
  return renameFormulaReferences(footer.formula.expression, labels);
}

export default function TableFootersEditor({
  footers,
  columns,
  externalReferences,
  tableFontSize,
  disabled,
  onChange,
}: {
  footers: TableFooter[];
  columns: TableColumn[];
  externalReferences: FormulaReferenceOption[];
  tableFontSize: number;
  disabled: boolean;
  onChange(footers: TableFooter[]): void;
}) {
  const [selectedFooterId, setSelectedFooterId] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<{
    index: number;
    label: string;
    affectedLabels: string[];
  }>();
  const updateFooter = (index: number, footer: TableFooter) => onChange(
    footers.map((item, current) => current === index ? footer : item),
  );
  const summableColumns = columns.filter(column =>
    ['number', 'currency', 'formula'].includes(column.valueType)
  );
  const requestDelete = (index: number) => {
    const footer = footers[index];
    const dependentIds = tableFooterDependentIds(footers, footer.id);
    if (dependentIds.length === 0) {
      onChange(footers.filter((_, current) => current !== index));
      return;
    }
    const dependentSet = new Set(dependentIds);
    setDeleteTarget({
      index,
      label: footer.label,
      affectedLabels: footers
        .filter(candidate => dependentSet.has(candidate.id))
        .map(candidate => candidate.label),
    });
  };
  const footer = footers.find(candidate => candidate.id === selectedFooterId) ?? footers[0];
  const index = footer ? footers.findIndex(candidate => candidate.id === footer.id) : -1;
  const referenceableFooters = footer
    ? footers.filter(source => canReferenceTableFooter(footers, footer.id, source.id))
    : [];
  return (
    <div className="layoutpdf-structured-editor">
      <div className="layoutpdf-table-list" role="list" aria-label={t('property.table.sectionFooters')}>
        {footers.map((item, itemIndex) => {
          const valueColumn = columns.find(column =>
            column.key === (item.valueColumnKey ?? columns.at(-1)?.key)
          )?.label ?? '-';
          return (
            <div key={item.id} className="layoutpdf-table-list-row" role="listitem">
              <button
                type="button"
                className="layoutpdf-table-list-item"
                aria-pressed={footer?.id === item.id}
                data-active={footer?.id === item.id || undefined}
                disabled={disabled}
                onClick={() => setSelectedFooterId(item.id)}
              >
                <span>{itemIndex + 1}. {item.label}</span>
                <small>
                  {footerFormulaSummary(item, footers, columns, externalReferences)} · {valueColumn}
                </small>
              </button>
              <span className="layoutpdf-table-list-actions">
                <IconButton
                  size="sm"
                  title={t('property.table.moveFooterUp')}
                  aria-label={t('property.table.moveFooterUp')}
                  disabled={disabled || itemIndex === 0}
                  onClick={() => onChange(moveTableFooter(footers, itemIndex, itemIndex - 1))}
                >
                  <Icon name="arrow-up" size={14} />
                </IconButton>
                <IconButton
                  size="sm"
                  title={t('property.table.moveFooterDown')}
                  aria-label={t('property.table.moveFooterDown')}
                  disabled={disabled || itemIndex === footers.length - 1}
                  onClick={() => onChange(moveTableFooter(footers, itemIndex, itemIndex + 1))}
                >
                  <Icon name="arrow-down" size={14} />
                </IconButton>
              </span>
            </div>
          );
        })}
      </div>
      {footer && index >= 0 ? (
        <div className="layoutpdf-table-list-detail layoutpdf-footer-item">
          <div className="layoutpdf-footer-rule-grid">
            <StructuredField label={t('property.table.footerTitle')}>
              <TextInput
                aria-label={`${t('property.table.footerTitle')} ${index + 1}`}
                value={footer.label}
                disabled={disabled}
                onValueChange={label => updateFooter(index, { ...footer, label })}
              />
            </StructuredField>
          </div>
          <div className="layoutpdf-footer-source-grid expression">
            <FormulaEditorDialogField
              label={t('property.formula.inputAria')}
              ariaLabel={`${t('property.formula.inputAria')} ${index + 1}`}
              value={footer.formula.expression}
              disabled={disabled}
              references={[
                ...summableColumns.map(column => ({
                  token: `column.${column.key}`,
                  label: column.label,
                })),
                ...referenceableFooters.map(source => ({
                  token: `footer.${source.id}`,
                  label: source.label,
                })),
                ...externalReferences,
              ]}
              onChange={expression => updateFooter(index, {
                ...footer,
                formula: { kind: 'expression', expression },
              })}
            />
          </div>
          <div className="layoutpdf-footer-display-grid">
            <StructuredField label={t('property.table.footerStartColumn')}>
              <Select
                aria-label={`${t('property.table.footerStartColumn')} ${index + 1}`}
                value={footer.startColumnKey ?? columns[0]?.key ?? ''}
                disabled={disabled || columns.length <= 1}
                onChange={startColumnKey => updateFooter(index, { ...footer, startColumnKey })}
                options={columns.map(column => ({ value: column.key, label: column.label }))}
              />
            </StructuredField>
            <span aria-hidden="true"><Icon name="arrow-right" size={12} /></span>
            <StructuredField label={t('property.table.footerValueColumn')}>
              <Select
                aria-label={`${t('property.table.footerValueColumn')} ${index + 1}`}
                value={footer.valueColumnKey ?? columns.at(-1)?.key ?? ''}
                disabled={disabled || columns.length <= 1}
                onChange={valueColumnKey => updateFooter(index, { ...footer, valueColumnKey })}
                options={columns.map(column => ({ value: column.key, label: column.label }))}
              />
            </StructuredField>
          </div>
          <div className="layoutpdf-footer-rule-actions">
            <label>
              <CheckboxInput
                checked={footer.bold ?? false}
                disabled={disabled}
                onCheckedChange={bold => updateFooter(index, { ...footer, bold })}
              />
              {t('property.table.footerBold')}
            </label>
            <span />
            <MenuButton
              label={t('property.table.footerActions', { index: index + 1 })}
              disabled={disabled}
              items={[
                {
                  id: 'previous',
                  label: t('property.table.moveFooterPrevious'),
                  disabled: index === 0,
                  onClick: () => onChange(moveTableFooter(footers, index, index - 1)),
                },
                {
                  id: 'next',
                  label: t('property.table.moveFooterNext'),
                  disabled: index === footers.length - 1,
                  onClick: () => onChange(moveTableFooter(footers, index, index + 1)),
                },
                { id: 'separator', label: '', divider: true },
                {
                  id: 'delete',
                  label: t('property.table.deleteFooter', { index: index + 1 }),
                  danger: true,
                  onClick: () => requestDelete(index),
                },
              ]}
            />
          </div>
          <Disclosure
            className="layoutpdf-footer-advanced"
            title={t('property.table.footerAdvanced')}
          >
            <div className="layoutpdf-footer-advanced-grid">
              <StructuredField label={t('property.table.footerOutputField')}>
                <TextInput
                  aria-label={`${t('property.table.footerOutputField')} ${index + 1}`}
                  value={footer.outputFieldKey ?? ''}
                  disabled={disabled}
                  onValueChange={outputFieldKey => updateFooter(
                    index,
                    updateTableFooterOutputField(footer, outputFieldKey),
                  )}
                />
              </StructuredField>
              <StructuredField label={t('property.common.fontSize')}>
                <NumberInput
                  aria-label={`${t('property.common.fontSize')} ${index + 1}`}
                  min={6}
                  max={72}
                  value={footer.fontSize ?? tableFontSize}
                  disabled={disabled}
                  onValueChange={fontSize => {
                    if (fontSize !== null) updateFooter(index, { ...footer, fontSize });
                  }}
                />
              </StructuredField>
            </div>
            <TableNumericFormatEditor
              value={footer.numericFormat}
              disabled={disabled}
              ariaSuffix={`${t('property.table.footerTitle')} ${index + 1}`}
              defaultPrefix="¥"
              decimalPlaces={footer.decimalPlaces}
              onDecimalPlacesChange={decimalPlaces => updateFooter(index, { ...footer, decimalPlaces })}
              onChange={numericFormat => updateFooter(index, { ...footer, numericFormat })}
            />
          </Disclosure>
        </div>
      ) : null}
      <Button size="compact" disabled={disabled || columns.length === 0} onClick={() => {
        const columnKey = summableColumns.at(-1)?.key ?? columns.at(-1)?.key;
        if (!columnKey) return;
        const id = createId('footer');
        setSelectedFooterId(id);
        onChange([...footers, {
          id,
          label: t('property.table.newFooter'),
          formula: { kind: 'expression', expression: `SUM(column.${columnKey})` },
        }]);
      }}>
        <Icon name="plus" size={14} /> {t('property.table.addFooter')}
      </Button>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('property.table.footerDeleteConfirmTitle')}
        description={deleteTarget
          ? t('property.table.footerDeleteConfirmDescription', {
              label: deleteTarget.label,
              affected: deleteTarget.affectedLabels.join('、'),
            })
          : ''}
        confirmLabel={t('property.table.footerDeleteConfirmAction')}
        tone="danger"
        onConfirm={() => {
          if (!deleteTarget) return;
          onChange(footers.filter((_, current) => current !== deleteTarget.index));
          setDeleteTarget(undefined);
        }}
        onClose={() => setDeleteTarget(undefined)}
      />
    </div>
  );
}
