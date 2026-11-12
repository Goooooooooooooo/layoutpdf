import type { CSSProperties } from 'react';
import type {
  BorderStyle,
  TableFooterBorderEdge,
  TableFooterBorderPreset,
  TableFooterStyle,
} from '@/engine/renderTree/model.js';
import {
  resolveTableFooterBorderEdges,
  TABLE_FOOTER_BORDER_EDGES,
  toggleTableFooterBorderEdge,
} from '@/engine/renderTree/tableFooterBorders.js';
import { StructuredField } from '@/editor/components/propertyPanel/PropertyField.js';
import Input, { NumberInput } from '@/ui/input/Input.js';
import Select from '@/ui/select/Select.js';
import { t } from '@/i18n/index.js';

const PRESETS: TableFooterBorderPreset[] = ['inherit', 'top', 'outer', 'all', 'none'];

const EDGE_LABEL_KEYS: Record<TableFooterBorderEdge, Parameters<typeof t>[0]> = {
  top: 'property.table.footerBorderTop',
  bottom: 'property.table.footerBorderBottom',
  left: 'property.table.footerBorderLeft',
  right: 'property.table.footerBorderRight',
  horizontal: 'property.table.footerBorderHorizontal',
  vertical: 'property.table.footerBorderVertical',
};

const PRESET_LABEL_KEYS: Record<TableFooterBorderPreset, Parameters<typeof t>[0]> = {
  inherit: 'property.table.footerBorderInherit',
  top: 'property.table.footerBorderTopPreset',
  outer: 'property.table.footerBorderOuter',
  all: 'property.table.footerBorderAll',
  none: 'property.table.footerBorderNone',
  custom: 'property.table.footerBorderCustom',
};

function defaultFooterStyle(tableBorder: BorderStyle): TableFooterStyle {
  return {
    borderPreset: 'inherit',
    border: { ...tableBorder },
  };
}

export default function TableFooterBorderEditor({
  value,
  tableBorder,
  disabled,
  onChange,
}: {
  value: TableFooterStyle | undefined;
  tableBorder: BorderStyle;
  disabled: boolean;
  onChange(value: TableFooterStyle): void;
}) {
  const current = value ?? defaultFooterStyle(tableBorder);
  const selectedEdges = new Set(resolveTableFooterBorderEdges(current));
  const previewStyle = {
    '--layoutpdf-footer-border-color': current.border.color,
    '--layoutpdf-footer-border-width': `${Math.max(1, Math.min(current.border.width, 3))}px`,
    '--layoutpdf-footer-border-line-style': current.border.style,
  } as CSSProperties;
  const patchBorder = (patch: Partial<BorderStyle>) => onChange({
    ...current,
    border: { ...current.border, ...patch },
  });
  const patchFill = (patch: { background?: string | null; color?: string | null }) => {
    const next = { ...current };
    if (patch.background !== undefined) {
      if (patch.background === null || patch.background === '') delete next.background;
      else next.background = patch.background;
    }
    if (patch.color !== undefined) {
      if (patch.color === null || patch.color === '') delete next.color;
      else next.color = patch.color;
    }
    onChange(next);
  };

  return (
    <div className="layoutpdf-footer-border-editor">
      <strong>{t('property.table.footerFillAppearance')}</strong>
      <p className="layoutpdf-footer-layout-note">{t('property.table.footerFillNote')}</p>
      <div className="layoutpdf-footer-border-fields">
        <StructuredField label={t('property.table.footerBackground')}>
          <Input
            type="color"
            clearable
            value={current.background}
            disabled={disabled}
            placeholder={t('property.table.footerBackground')}
            onChange={color => { if (typeof color === 'string') patchFill({ background: color }); }}
            onClear={() => patchFill({ background: null })}
          />
        </StructuredField>
        <StructuredField label={t('property.table.footerColor')}>
          <Input
            type="color"
            clearable
            value={current.color}
            disabled={disabled}
            placeholder={t('property.table.footerColor')}
            onChange={color => { if (typeof color === 'string') patchFill({ color }); }}
            onClear={() => patchFill({ color: null })}
          />
        </StructuredField>
      </div>
      <strong>{t('property.table.footerBorderAppearance')}</strong>
      <div
        className="layoutpdf-footer-border-presets"
        role="radiogroup"
        aria-label={t('property.table.footerBorderPreset')}
      >
        {PRESETS.map(preset => (
          <button
            key={preset}
            type="button"
            role="radio"
            aria-checked={current.borderPreset === preset}
            data-active={current.borderPreset === preset || undefined}
            disabled={disabled}
            onClick={() => {
              const next = { ...current, borderPreset: preset };
              delete next.borderEdges;
              onChange(next);
            }}
          >
            <span className={`layoutpdf-footer-border-preset-icon ${preset}`} aria-hidden="true" />
            {t(PRESET_LABEL_KEYS[preset])}
          </button>
        ))}
      </div>
      <div className="layoutpdf-footer-border-custom-heading">
        <span>{t('property.table.footerBorderCustom')}</span>
        <small>
          {current.borderPreset === 'custom'
            ? t('property.table.footerBorderCustom')
            : t(PRESET_LABEL_KEYS[current.borderPreset])}
        </small>
      </div>
      <div
        className="layoutpdf-footer-border-selector"
        style={previewStyle}
        role="group"
        aria-label={t('property.table.footerBorderEdges')}
      >
        {TABLE_FOOTER_BORDER_EDGES.map(edge => (
          <button
            key={edge}
            type="button"
            className={edge}
            aria-label={t(EDGE_LABEL_KEYS[edge])}
            aria-pressed={selectedEdges.has(edge)}
            disabled={disabled}
            onClick={() => onChange(toggleTableFooterBorderEdge(current, edge))}
          />
        ))}
      </div>
      {current.borderPreset === 'inherit' ? (
        <p className="layoutpdf-footer-layout-note">{t('property.table.footerBorderInheritNote')}</p>
      ) : null}
      {selectedEdges.size > 0 ? (
        <div className="layoutpdf-footer-border-fields">
          <StructuredField label={t('property.common.borderColor')}>
            <Input
              type="color"
              value={current.border.color}
              disabled={disabled}
              onChange={color => {
                if (typeof color === 'string') patchBorder({ color });
              }}
            />
          </StructuredField>
          <StructuredField label={t('property.common.borderWidth')}>
            <NumberInput
              min={0}
              max={20}
              step={0.5}
              value={current.border.width}
              disabled={disabled}
              onValueChange={width => {
                if (width !== null) patchBorder({ width });
              }}
            />
          </StructuredField>
          <StructuredField label={t('property.common.borderStyle')}>
            <Select
              value={current.border.style}
              disabled={disabled}
              onChange={style => patchBorder({
                style: style as BorderStyle['style'],
              })}
              options={[
                { value: 'solid', label: t('property.option.borderSolid') },
                { value: 'dashed', label: t('property.option.borderDashed') },
                { value: 'dotted', label: t('property.option.borderDotted') },
              ]}
            />
          </StructuredField>
        </div>
      ) : null}
    </div>
  );
}
