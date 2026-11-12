import { useState } from 'react';
import type { TemplatePage } from '@/engine/core/document.js';
import type { BorderStyle, TableFooterBorderEdge } from '@/engine/renderTree/model.js';
import { StructuredField } from '@/editor/components/propertyPanel/PropertyField.js';
import InspectorColorField from '@/editor/components/propertyPanel/InspectorColorField.js';
import ElementOutputPicker from '@/editor/components/propertyPanel/summary/ElementOutputPicker.js';
import {
  normalizeSummaryBorderEdges,
  type SummaryBlockBandLayout,
  type SummaryBlockProps,
  type SummaryBlockRowsLayout,
} from '@/plugins/summary/summary.js';
import type { TableProps } from '@/plugins/table/table.js';
import Button from '@/ui/button/Button.js';
import IconButton from '@/ui/button/IconButton.js';
import Icon from '@/ui/icon/Icon.js';
import { NumberInput, TextInput } from '@/ui/input/Input.js';
import Switch from '@/ui/input/Switch.js';
import MenuButton from '@/ui/menuButton/MenuButton.js';
import Select from '@/ui/select/Select.js';
import { t } from '@/i18n/index.js';

export type SummaryInspectorTab = 'sources' | 'items' | 'layout' | 'style';

const TABS: Array<{
  id: SummaryInspectorTab;
  labelKey:
    | 'property.summary.sources'
    | 'property.summary.items'
    | 'property.summary.layout'
    | 'property.summary.style';
}> = [
  { id: 'sources', labelKey: 'property.summary.sources' },
  { id: 'items', labelKey: 'property.summary.items' },
  { id: 'layout', labelKey: 'property.summary.layout' },
  { id: 'style', labelKey: 'property.summary.style' },
];

const BORDER_EDGES: TableFooterBorderEdge[] = [
  'top',
  'bottom',
  'left',
  'right',
  'horizontal',
  'vertical',
];

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function SummaryBlockEditor({
  page,
  summaryId,
  props,
  disabled,
  initialTab = 'sources',
  onChange,
  onToggleOutput,
  onSelectSource,
}: {
  page: TemplatePage;
  summaryId: string;
  props: SummaryBlockProps;
  disabled: boolean;
  initialTab?: SummaryInspectorTab;
  onChange(props: SummaryBlockProps): void;
  onToggleOutput(sourceElementId: string, outputId: string, selected: boolean): void;
  onSelectSource(sourceElementId: string): void;
}) {
  const [tab, setTab] = useState<SummaryInspectorTab>(initialTab);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const sourceTables = new Map(page.elements
    .filter(element => element.type === 'table')
    .map(element => [element.id, element]));
  const sourceIds = [...new Set(props.items.map(item => item.source.sourceElementId))];
  const activeItem = props.items.find(item => item.id === selectedItemId) ?? props.items[0];
  const activeIndex = activeItem ? props.items.findIndex(item => item.id === activeItem.id) : -1;

  const patchStyle = (patch: Partial<SummaryBlockProps['style']>) => onChange({
    ...props,
    style: { ...props.style, ...patch },
  });
  const patchItem = (index: number, patch: Partial<SummaryBlockProps['items'][number]>) => {
    onChange({
      ...props,
      items: props.items.map((item, current) => current === index ? { ...item, ...patch } : item),
    });
  };
  const clearItemFontSize = (index: number) => {
    onChange({
      ...props,
      items: props.items.map((item, current) => {
        if (current !== index) return item;
        const { fontSize: _fontSize, ...next } = item;
        return next;
      }),
    });
  };

  return (
    <div className="layoutpdf-summary-inspector" data-summary-id={summaryId}>
      <div
        className="layoutpdf-summary-inspector-tabs"
        role="tablist"
        aria-label={t('property.summary.settings')}
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

      <div className="layoutpdf-summary-inspector-content" role="tabpanel">
        {tab === 'sources' ? (
          <div className="layoutpdf-summary-editor">
            <ElementOutputPicker
              page={page}
              props={props}
              disabled={disabled}
              onToggle={onToggleOutput}
            />
            {sourceIds.length > 0 ? (
              <section>
                <h4>{t('property.summary.editSources')}</h4>
                <div className="layoutpdf-summary-source-actions">
                  {sourceIds.map(sourceId => (
                    <Button
                      key={sourceId}
                      size="compact"
                      disabled={!sourceTables.has(sourceId)}
                      onClick={() => onSelectSource(sourceId)}
                    >
                      {sourceTables.get(sourceId)?.name ?? t('property.summary.invalidReference')}
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === 'items' ? (
          <div className="layoutpdf-summary-item-editor">
            {props.items.length === 0 ? (
              <p className="layoutpdf-panel-note">{t('property.summary.empty')}</p>
            ) : (
              <>
                <div className="layoutpdf-table-list" role="listbox" aria-label={t('property.summary.items')}>
                  {props.items.map((item, index) => {
                    const source = sourceTables.get(item.source.sourceElementId);
                    const footer = source
                      ? (source.props as TableProps).footers.find(candidate => candidate.id === item.source.outputId)
                      : undefined;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={activeItem?.id === item.id}
                        className="layoutpdf-table-list-item"
                        data-active={activeItem?.id === item.id || undefined}
                        disabled={disabled}
                        onClick={() => setSelectedItemId(item.id)}
                      >
                        <span>{index + 1}. {item.customLabel || footer?.label || item.source.outputId}</span>
                        <small>{source?.name ?? t('property.summary.invalidReference')}</small>
                      </button>
                    );
                  })}
                </div>
                {activeItem && activeIndex >= 0 ? (
                  <div className="layoutpdf-table-list-detail layoutpdf-summary-item-detail">
                    <div className="layoutpdf-summary-detail-heading">
                      <strong>{activeItem.customLabel
                        || (sourceTables.get(activeItem.source.sourceElementId)?.props as TableProps | undefined)
                          ?.footers.find(footer => footer.id === activeItem.source.outputId)?.label
                        || activeItem.source.outputId}</strong>
                      <MenuButton
                        label={t('property.summary.itemActions', { index: activeIndex + 1 })}
                        disabled={disabled}
                        items={[
                          {
                            id: 'previous',
                            label: t('property.summary.movePrevious'),
                            disabled: activeIndex === 0,
                            onClick: () => onChange({
                              ...props,
                              items: moveItem(props.items, activeIndex, activeIndex - 1),
                            }),
                          },
                          {
                            id: 'next',
                            label: t('property.summary.moveNext'),
                            disabled: activeIndex === props.items.length - 1,
                            onClick: () => onChange({
                              ...props,
                              items: moveItem(props.items, activeIndex, activeIndex + 1),
                            }),
                          },
                          { id: 'divider-delete', label: '', divider: true },
                          {
                            id: 'delete',
                            label: t('property.summary.removeItem'),
                            danger: true,
                            onClick: () => onChange({
                              ...props,
                              items: props.items.filter(item => item.id !== activeItem.id),
                            }),
                          },
                        ]}
                      />
                    </div>
                    <StructuredField label={t('property.summary.labelMode')}>
                      <Select
                        value={activeItem.labelMode}
                        disabled={disabled}
                        onChange={labelMode => patchItem(activeIndex, {
                          labelMode: labelMode as 'source' | 'custom',
                        })}
                        options={[
                          { value: 'source', label: t('property.summary.labelSource') },
                          { value: 'custom', label: t('property.summary.labelCustom') },
                        ]}
                      />
                    </StructuredField>
                    {activeItem.labelMode === 'custom' ? (
                      <StructuredField label={t('property.summary.customLabel')}>
                        <TextInput
                          value={activeItem.customLabel ?? ''}
                          disabled={disabled}
                          onValueChange={customLabel => patchItem(activeIndex, { customLabel })}
                        />
                      </StructuredField>
                    ) : null}
                    <div className="layoutpdf-summary-detail-grid">
                      <StructuredField label={t('property.summary.itemWidth')}>
                        <NumberInput
                          value={activeItem.width}
                          min={0.1}
                          step={0.1}
                          disabled={disabled}
                          onValueChange={width => {
                            if (width !== null && width > 0) patchItem(activeIndex, { width });
                          }}
                        />
                      </StructuredField>
                      <StructuredField label={t('property.summary.itemFontSize')}>
                        <NumberInput
                          value={activeItem.fontSize ?? null}
                          min={1}
                          max={72}
                          disabled={disabled}
                          onValueChange={fontSize => {
                            if (fontSize === null) clearItemFontSize(activeIndex);
                            else patchItem(activeIndex, { fontSize });
                          }}
                        />
                      </StructuredField>
                    </div>
                    <label className="layoutpdf-summary-switch-row">
                      <span>{t('property.summary.itemBold')}</span>
                      <Switch
                        checked={activeItem.bold ?? false}
                        disabled={disabled}
                        onChange={bold => patchItem(activeIndex, { bold })}
                      />
                    </label>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {tab === 'layout' ? (
          <div className="layoutpdf-summary-editor">
            <StructuredField label={t('property.summary.layoutMode')}>
              <Select
                value={props.layout.kind}
                disabled={disabled}
                options={[
                  { value: 'rows', label: t('property.summary.layoutRows') },
                  { value: 'band', label: t('property.summary.layoutBand') },
                ]}
                onChange={kind => onChange({
                  ...props,
                  layout: kind === 'band'
                    ? {
                        kind: 'band',
                        leadLabel: t('property.summary.defaultLeadLabel'),
                        leadBold: true,
                        leadWidth: 1.5,
                        headerWeight: 1,
                        valueWeight: 1,
                      }
                    : { kind: 'rows', labelWidth: 3, valueWidth: 2 },
                })}
              />
            </StructuredField>
            {props.layout.kind === 'rows' ? (
              <div className="layoutpdf-summary-detail-grid">
                <StructuredField label={t('property.summary.labelWidth')}>
                  <NumberInput
                    value={props.layout.labelWidth}
                    min={0.1}
                    step={0.1}
                    disabled={disabled}
                    onValueChange={labelWidth => {
                      if (labelWidth !== null && labelWidth > 0) onChange({
                        ...props,
                        layout: { ...(props.layout as SummaryBlockRowsLayout), labelWidth },
                      });
                    }}
                  />
                </StructuredField>
                <StructuredField label={t('property.summary.valueWidth')}>
                  <NumberInput
                    value={props.layout.valueWidth}
                    min={0.1}
                    step={0.1}
                    disabled={disabled}
                    onValueChange={valueWidth => {
                      if (valueWidth !== null && valueWidth > 0) onChange({
                        ...props,
                        layout: { ...(props.layout as SummaryBlockRowsLayout), valueWidth },
                      });
                    }}
                  />
                </StructuredField>
              </div>
            ) : (
              <>
                <StructuredField label={t('property.summary.leadLabel')}>
                  <TextInput
                    value={props.layout.leadLabel}
                    disabled={disabled}
                    onValueChange={leadLabel => onChange({
                      ...props,
                      layout: { ...(props.layout as SummaryBlockBandLayout), leadLabel },
                    })}
                  />
                </StructuredField>
                <label className="layoutpdf-summary-switch-row">
                  <span>{t('property.summary.leadBold')}</span>
                  <Switch
                    checked={props.layout.leadBold}
                    disabled={disabled}
                    onChange={leadBold => onChange({
                      ...props,
                      layout: { ...(props.layout as SummaryBlockBandLayout), leadBold },
                    })}
                  />
                </label>
                <div className="layoutpdf-summary-detail-grid">
                  {([
                    ['leadWidth', t('property.summary.leadWidth')],
                    ['headerWeight', t('property.summary.headerWeight')],
                    ['valueWeight', t('property.summary.valueWeight')],
                  ] as const).map(([key, label]) => (
                    <StructuredField key={key} label={label}>
                      <NumberInput
                        value={(props.layout as SummaryBlockBandLayout)[key]}
                        min={0.1}
                        step={0.1}
                        disabled={disabled}
                        onValueChange={value => {
                          if (value !== null && value > 0) onChange({
                            ...props,
                            layout: { ...(props.layout as SummaryBlockBandLayout), [key]: value },
                          });
                        }}
                      />
                    </StructuredField>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        {tab === 'style' ? (
          <div className="layoutpdf-summary-editor">
            <div className="layoutpdf-summary-detail-grid">
              <StructuredField label={t('property.common.fontSize')}>
                <NumberInput
                  value={props.style.fontSize}
                  min={1}
                  max={72}
                  disabled={disabled}
                  onValueChange={fontSize => {
                    if (fontSize !== null) patchStyle({ fontSize });
                  }}
                />
              </StructuredField>
              <StructuredField label={t('property.summary.cellPadding')}>
                <NumberInput
                  value={props.style.cellPadding}
                  min={0}
                  max={20}
                  step={0.5}
                  disabled={disabled}
                  onValueChange={cellPadding => {
                    if (cellPadding !== null) patchStyle({ cellPadding });
                  }}
                />
              </StructuredField>
            </div>
            {([
              ['labelBold', t('property.summary.labelBold')],
              ['valueBold', t('property.summary.valueBold')],
            ] as const).map(([key, label]) => (
              <label key={key} className="layoutpdf-summary-switch-row">
                <span>{label}</span>
                <Switch
                  checked={props.style[key]}
                  disabled={disabled}
                  onChange={value => patchStyle({ [key]: value })}
                />
              </label>
            ))}
            {([
              ['labelColor', t('property.summary.labelColor')],
              ['valueColor', t('property.summary.valueColor')],
              ['labelBackground', t('property.summary.labelBackground')],
              ['valueBackground', t('property.summary.valueBackground')],
              ['borderColor', t('property.common.borderColor')],
            ] as const).map(([key, label]) => {
              const value = key === 'borderColor' ? props.style.border.color : props.style[key];
              return (
                <StructuredField key={key} label={label}>
                  <span className={key === 'valueBackground' ? 'layoutpdf-summary-color-control' : undefined}>
                    <InspectorColorField
                      id={`summary-${key}`}
                      value={value}
                      mixed={false}
                      disabled={disabled}
                      onChange={next => {
                        if (key === 'borderColor') {
                          patchStyle({ border: { ...props.style.border, color: next } });
                        } else {
                          patchStyle({ [key]: next });
                        }
                      }}
                    />
                    {key === 'valueBackground' ? (
                      <IconButton
                        size="sm"
                        disabled={disabled || props.style.valueBackground === undefined}
                        title={t('property.panel.clearProperty', { label })}
                        aria-label={t('property.panel.clearProperty', { label })}
                        onClick={() => {
                          const { valueBackground: _valueBackground, ...style } = props.style;
                          onChange({ ...props, style });
                        }}
                      >
                        <Icon name="x" size={14} />
                      </IconButton>
                    ) : null}
                  </span>
                </StructuredField>
              );
            })}
            <div className="layoutpdf-summary-detail-grid">
              <StructuredField label={t('property.common.borderWidth')}>
                <NumberInput
                  value={props.style.border.width}
                  min={0}
                  max={20}
                  step={0.5}
                  disabled={disabled}
                  onValueChange={width => {
                    if (width !== null) patchStyle({ border: { ...props.style.border, width } });
                  }}
                />
              </StructuredField>
              <StructuredField label={t('property.common.borderStyle')}>
                <Select
                  value={props.style.border.style}
                  disabled={disabled}
                  options={[
                    { value: 'solid', label: t('property.option.borderSolid') },
                    { value: 'dashed', label: t('property.option.borderDashed') },
                    { value: 'dotted', label: t('property.option.borderDotted') },
                  ]}
                  onChange={style => patchStyle({
                    border: { ...props.style.border, style: style as BorderStyle['style'] },
                  })}
                />
              </StructuredField>
            </div>
            <StructuredField label={t('property.summary.borderPreset')}>
              <Select
                value={props.style.borderPreset}
                disabled={disabled}
                options={[
                  { value: 'outer', label: t('property.summary.borderOuter') },
                  { value: 'all', label: t('property.summary.borderAll') },
                  { value: 'none', label: t('property.summary.borderNone') },
                  { value: 'custom', label: t('property.summary.borderCustom') },
                ]}
                onChange={value => {
                  const borderPreset = value as SummaryBlockProps['style']['borderPreset'];
                  if (borderPreset === 'custom') {
                    patchStyle({
                      borderPreset,
                      borderEdges: normalizeSummaryBorderEdges(props.style.borderEdges),
                    });
                    return;
                  }
                  const { borderEdges: _borderEdges, ...style } = props.style;
                  onChange({ ...props, style: { ...style, borderPreset } });
                }}
              />
            </StructuredField>
            {props.style.borderPreset === 'custom' ? (
              <div className="layoutpdf-summary-border-edges">
                {BORDER_EDGES.map(edge => (
                  <label key={edge} className="layoutpdf-summary-switch-row">
                    <span>{t(`property.summary.borderEdge.${edge}`)}</span>
                    <Switch
                      checked={props.style.borderEdges?.includes(edge) ?? false}
                      disabled={disabled}
                      onChange={checked => patchStyle({
                        borderEdges: normalizeSummaryBorderEdges(checked
                          ? [...(props.style.borderEdges ?? []), edge]
                          : (props.style.borderEdges ?? []).filter(candidate => candidate !== edge)),
                      })}
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
