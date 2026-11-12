import { useState } from 'react';
import type { TableValueRow } from '@/engine/renderTree/model.js';
import type { TableProps } from '@/plugins/table/table.js';
import Button from '@/ui/button/Button.js';
import Disclosure from '@/ui/disclosure/Disclosure.js';
import { t } from '@/i18n/index.js';
import TableColumnsEditor from './TableColumnsEditor.js';
import TableDefaultRowsEditor from './TableDefaultRowsEditor.js';
import TableFootersEditor from './TableFootersEditor.js';
import TableFooterBandEditor from './TableFooterBandEditor.js';
import {
  reconcileTableReferences,
  updateTableFootersInProps,
} from '@/editor/utils/tablePropertyOptions.js';
import type { FormulaReferenceOption } from '@/editor/components/propertyPanel/FormulaExpressionInput.js';

export type TableInspectorTab = 'columns' | 'rows' | 'footers';

const TABS: Array<{
  id: TableInspectorTab;
  labelKey:
    | 'property.table.sectionColumns'
    | 'property.table.sectionDefaultRows'
    | 'property.table.sectionFooters';
}> = [
  { id: 'columns', labelKey: 'property.table.sectionColumns' },
  { id: 'rows', labelKey: 'property.table.sectionDefaultRows' },
  { id: 'footers', labelKey: 'property.table.sectionFooters' },
];

export default function TableInspectorEditor({
  props,
  rows,
  externalReferences = [],
  disabled,
  initialTab = 'columns',
  onPropsChange,
  onRowsChange,
}: {
  props: TableProps;
  rows: TableValueRow[];
  externalReferences?: FormulaReferenceOption[];
  disabled: boolean;
  initialTab?: TableInspectorTab;
  onPropsChange(props: TableProps): void;
  onRowsChange(rows: TableValueRow[]): void;
}) {
  const [tab, setTab] = useState<TableInspectorTab>(initialTab);

  return (
    <div className="layoutpdf-table-inspector">
      <div
        className="layoutpdf-table-inspector-tabs"
        role="tablist"
        aria-label={t('property.panel.tableStructure')}
      >
        {TABS.map(item => (
          <Button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            variant={tab === item.id ? 'primary' : 'ghost'}
            size="compact"
            onClick={() => setTab(item.id)}
          >
            {t(item.labelKey)}
          </Button>
        ))}
      </div>
      <div className="layoutpdf-table-inspector-content" role="tabpanel">
        {tab === 'columns' ? (
          <TableColumnsEditor
            columns={props.columns}
            externalReferences={externalReferences}
            disabled={disabled}
            onChange={nextColumns => {
              const reconciled = reconcileTableReferences(
                props.columns,
                nextColumns,
                props.footers,
              );
              onPropsChange({ ...props, ...reconciled });
            }}
          />
        ) : null}
        {tab === 'rows' ? (
          <TableDefaultRowsEditor
            rows={rows}
            columns={props.columns}
            disabled={disabled}
            onChange={onRowsChange}
          />
        ) : null}
        {tab === 'footers' ? (
          <>
            <TableFootersEditor
              footers={props.footers}
              columns={props.columns}
              externalReferences={externalReferences}
              tableFontSize={props.style.fontSize}
              disabled={disabled}
              onChange={nextFooters => onPropsChange(
                updateTableFootersInProps(props, nextFooters),
              )}
            />
            <Disclosure
              className="layoutpdf-table-layout-disclosure"
              title={t('property.table.sectionFooterBand')}
            >
              <TableFooterBandEditor
                band={props.footerBand}
                footerStyle={props.footerStyle}
                tableBorder={props.style.border}
                footers={props.footers}
                columns={props.columns}
                disabled={disabled}
                onChange={footerBand => onPropsChange({ ...props, footerBand })}
                onStyleChange={footerStyle => onPropsChange({ ...props, footerStyle })}
              />
            </Disclosure>
          </>
        ) : null}
      </div>
    </div>
  );
}
