import type { TableNumericFormat } from '@/engine/renderTree/model.js';
import { StructuredField } from '@/editor/components/propertyPanel/PropertyField.js';
import Select from '@/ui/select/Select.js';
import { TextInput } from '@/ui/input/Input.js';
import { t } from '@/i18n/index.js';

const DEFAULT_TABLE_NUMERIC_FORMAT: TableNumericFormat = {
  prefix: '',
  symbolLayout: 'attached',
  zeroDisplay: 'zero',
  emptyDisplay: 'blank',
};

export default function TableNumericFormatEditor({
  value,
  disabled,
  ariaSuffix,
  defaultPrefix = '',
  onChange,
}: {
  value: TableNumericFormat | undefined;
  disabled: boolean;
  ariaSuffix: string;
  defaultPrefix?: string;
  onChange(value: TableNumericFormat): void;
}) {
  const format = value ?? { ...DEFAULT_TABLE_NUMERIC_FORMAT, prefix: defaultPrefix };
  const patch = (next: Partial<TableNumericFormat>) => onChange({ ...format, ...next });
  return (
    <div className="layoutpdf-column-line l3">
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
