import type {
  BorderStyle,
  TableColumn,
  TableFooter,
  TableFooterBand,
  TableFooterStyle,
} from '@/engine/renderTree/model.js';
import { StructuredField } from '@/editor/components/propertyPanel/PropertyField.js';
import TableFooterBorderEditor from './TableFooterBorderEditor.js';
import Button from '@/ui/button/Button.js';
import { NumberInput, TextInput } from '@/ui/input/Input.js';
import SegmentedControl from '@/ui/segmentedControl/SegmentedControl.js';
import Select from '@/ui/select/Select.js';
import { t } from '@/i18n/index.js';

function createDefaultFooterBand(footers: TableFooter[]): TableFooterBand {
  return {
    enabled: true,
    label: t('property.table.footerBandDefaultLabel'),
    leadWidth: 1,
    headerHeight: 5,
    valueHeight: 7,
    items: footers.map(footer => ({ footerId: footer.id, width: 2 })),
  };
}

function widthPercent(width: number, band: TableFooterBand): number {
  const total = band.leadWidth + band.items.reduce((sum, item) => sum + item.width, 0);
  return total > 0 ? Math.round(width / total * 100) : 0;
}

export default function TableFooterBandEditor({
  band,
  footerStyle,
  tableBorder,
  footers,
  columns,
  disabled,
  onChange,
  onStyleChange,
}: {
  band: TableFooterBand | undefined;
  footerStyle: TableFooterStyle | undefined;
  tableBorder: BorderStyle;
  footers: TableFooter[];
  columns: TableColumn[];
  disabled: boolean;
  onChange(band: TableFooterBand | undefined): void;
  onStyleChange(style: TableFooterStyle): void;
}) {
  const current = band ?? createDefaultFooterBand(footers);
  const mode = band?.enabled ? 'band' : 'rows';
  const patch = (next: Partial<TableFooterBand>) => onChange({ ...current, ...next });
  return (
    <div className="layoutpdf-footer-layout-editor">
      <SegmentedControl
        value={mode}
        disabled={disabled}
        aria-label={t('property.table.footerLayoutMode')}
        options={[
          { value: 'rows', label: t('property.table.footerLayoutRows') },
          { value: 'band', label: t('property.table.footerLayoutBand') },
        ]}
        onChange={nextMode => {
          if (nextMode === 'band') onChange({ ...current, enabled: true });
          else if (band) onChange({ ...band, enabled: false });
          else onChange(undefined);
        }}
      />
      <p className="layoutpdf-footer-layout-note">
        {mode === 'band'
          ? t('property.table.footerLayoutBandNote')
          : t('property.table.footerLayoutRowsNote')}
      </p>
      {mode === 'band' ? (
        <>
          <div className="layoutpdf-footer-layout-grid">
            <StructuredField label={t('property.table.footerBandLabel')}>
              <TextInput
                value={current.label}
                disabled={disabled}
                onValueChange={label => patch({ label })}
              />
            </StructuredField>
            <StructuredField label={t('property.table.footerBandStartColumn')}>
              <Select
                value={current.startColumnKey ?? columns[0]?.key ?? ''}
                disabled={disabled || columns.length === 0}
                onChange={startColumnKey => patch({ startColumnKey })}
                options={columns.map(column => ({ value: column.key, label: column.label }))}
              />
            </StructuredField>
            <StructuredField label={t('property.table.footerBandLeadWidth')}>
              <NumberInput
                min={0.1}
                step={0.1}
                value={current.leadWidth}
                disabled={disabled}
                onValueChange={leadWidth => {
                  if (leadWidth !== null) patch({ leadWidth });
                }}
              />
            </StructuredField>
            <StructuredField label={t('property.table.footerBandHeaderHeight')}>
              <NumberInput
                min={1}
                step={0.5}
                value={current.headerHeight}
                disabled={disabled}
                onValueChange={headerHeight => {
                  if (headerHeight !== null) patch({ headerHeight });
                }}
              />
            </StructuredField>
            <StructuredField label={t('property.table.footerBandValueHeight')}>
              <NumberInput
                min={1}
                step={0.5}
                value={current.valueHeight}
                disabled={disabled}
                onValueChange={valueHeight => {
                  if (valueHeight !== null) patch({ valueHeight });
                }}
              />
            </StructuredField>
          </div>
          <div className="layoutpdf-footer-band-width-heading">
            <strong>{t('property.table.footerBandWidths')}</strong>
            <Button
              size="compact"
              disabled={disabled || current.items.length === 0}
              onClick={() => patch({
                items: current.items.map(item => ({ ...item, width: 1 })),
              })}
            >
              {t('property.table.footerBandEqualize')}
            </Button>
          </div>
          <div className="layoutpdf-footer-band-preview" aria-label={t('property.table.footerBandPreview')}>
            <span style={{ flexGrow: current.leadWidth }}>
              {current.label} · {widthPercent(current.leadWidth, current)}%
            </span>
            {current.items.map(item => {
              const footer = footers.find(candidate => candidate.id === item.footerId);
              return (
                <span key={item.footerId} style={{ flexGrow: item.width }}>
                  {footer?.label ?? item.footerId} · {widthPercent(item.width, current)}%
                </span>
              );
            })}
          </div>
          <div className="layoutpdf-footer-band-items">
            {current.items.map((item, index) => {
              const footer = footers.find(candidate => candidate.id === item.footerId);
              return (
                <div key={item.footerId} className="layoutpdf-footer-band-item">
                  <span>{footer?.label ?? item.footerId}</span>
                  <small>{widthPercent(item.width, current)}%</small>
                  <NumberInput
                    aria-label={t('property.table.footerBandItemWidthAria', {
                      label: footer?.label ?? item.footerId,
                    })}
                    min={0.1}
                    step={0.1}
                    value={item.width}
                    disabled={disabled}
                    onValueChange={width => {
                      if (width !== null) patch({
                        items: current.items.map((candidate, currentIndex) => currentIndex === index
                          ? { ...candidate, width }
                          : candidate),
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      <TableFooterBorderEditor
        value={footerStyle}
        tableBorder={tableBorder}
        disabled={disabled}
        onChange={onStyleChange}
      />
    </div>
  );
}
