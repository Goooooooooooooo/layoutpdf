import type { TableNumericFormat } from '@/engine/renderTree/model.js';
import { StructuredField } from '@/editor/components/propertyPanel/PropertyField.js';
import Select from '@/ui/select/Select.js';
import { NumberInput, TextInput } from '@/ui/input/Input.js';
import { t } from '@/i18n/index.js';

const DEFAULT_TABLE_NUMERIC_FORMAT: TableNumericFormat = {
  prefix: '',
  symbolLayout: 'attached',
  zeroDisplay: 'zero',
  emptyDisplay: 'blank',
};

const NEGATIVE_STYLE_SAMPLES = {
  'minus-after-symbol': '¥-1,000',
  'minus-before-symbol': '-¥1,000',
  parentheses: '(¥1,000)',
  triangle: '▲¥1,000',
} as const;

export default function TableNumericFormatEditor({
  value,
  disabled,
  ariaSuffix,
  defaultPrefix = '',
  decimalPlaces,
  onDecimalPlacesChange,
  onChange,
}: {
  value: TableNumericFormat | undefined;
  disabled: boolean;
  ariaSuffix: string;
  defaultPrefix?: string;
  decimalPlaces?: number;
  onDecimalPlacesChange?(value: number | undefined): void;
  onChange(value: TableNumericFormat): void;
}) {
  const format = value ?? { ...DEFAULT_TABLE_NUMERIC_FORMAT, prefix: defaultPrefix };
  const patch = (next: Partial<TableNumericFormat>) => onChange({ ...format, ...next });
  return (
    <div className="layoutpdf-column-line l3">
      {onDecimalPlacesChange ? (
        <StructuredField label={t('property.common.decimalPlaces')}>
          <NumberInput
            aria-label={`${t('property.common.decimalPlaces')} ${ariaSuffix}`}
            min={0}
            max={10}
            step={1}
            value={decimalPlaces ?? null}
            disabled={disabled}
            onValueChange={next => onDecimalPlacesChange(next ?? undefined)}
          />
        </StructuredField>
      ) : null}
      <StructuredField label={t('property.table.numericPrefix')}>
        <TextInput
          aria-label={`${t('property.table.numericPrefix')} ${ariaSuffix}`}
          value={format.prefix}
          disabled={disabled}
          onValueChange={prefix => patch({ prefix })}
        />
      </StructuredField>
      <StructuredField label={t('property.table.symbolLayout')}>
        <Select
          aria-label={`${t('property.table.symbolLayout')} ${ariaSuffix}`}
          value={format.symbolLayout}
          disabled={disabled}
          onChange={symbolLayout => patch({ symbolLayout: symbolLayout as TableNumericFormat['symbolLayout'] })}
          options={[
            { value: 'attached', label: t('property.currency.symbolAttached') },
            { value: 'edge', label: t('property.currency.symbolEdge') },
          ]}
        />
      </StructuredField>
      <StructuredField label={t('property.common.negativeStyle')}>
        <Select
          aria-label={`${t('property.common.negativeStyle')} ${ariaSuffix}`}
          value={format.negativeStyle ?? 'minus-after-symbol'}
          disabled={disabled}
          onChange={negativeStyle => patch({
            negativeStyle: negativeStyle as NonNullable<TableNumericFormat['negativeStyle']>,
          })}
          options={[
            { value: 'minus-after-symbol', label: NEGATIVE_STYLE_SAMPLES['minus-after-symbol'] },
            { value: 'minus-before-symbol', label: NEGATIVE_STYLE_SAMPLES['minus-before-symbol'] },
            { value: 'parentheses', label: NEGATIVE_STYLE_SAMPLES.parentheses },
            { value: 'triangle', label: NEGATIVE_STYLE_SAMPLES.triangle },
          ]}
        />
      </StructuredField>
      <StructuredField label={t('property.table.zeroDisplay')}>
        <Select
          aria-label={`${t('property.table.zeroDisplay')} ${ariaSuffix}`}
          value={format.zeroDisplay}
          disabled={disabled}
          onChange={zeroDisplay => patch({ zeroDisplay: zeroDisplay as TableNumericFormat['zeroDisplay'] })}
          options={[
            { value: 'zero', label: t('property.table.displayZero') },
            { value: 'dash', label: t('property.table.displayDash') },
            { value: 'blank', label: t('property.table.displayBlank') },
          ]}
        />
      </StructuredField>
      <StructuredField label={t('property.table.emptyDisplay')}>
        <Select
          aria-label={`${t('property.table.emptyDisplay')} ${ariaSuffix}`}
          value={format.emptyDisplay}
          disabled={disabled}
          onChange={emptyDisplay => patch({ emptyDisplay: emptyDisplay as TableNumericFormat['emptyDisplay'] })}
          options={[
            { value: 'blank', label: t('property.table.displayBlank') },
            { value: 'dash', label: t('property.table.displayDash') },
          ]}
        />
      </StructuredField>
    </div>
  );
}
