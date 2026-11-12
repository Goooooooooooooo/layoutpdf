import type { ChangeEvent, SelectHTMLAttributes } from 'react';
import { t } from '@/i18n/index.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface BaseSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'multiple'> {
  options: SelectOption[];
  mixed?: boolean;
  placeholder?: string;
}

interface SingleSelectProps extends BaseSelectProps {
  value: string;
  onChange(value: string): void;
  multiple?: false;
}

interface MultipleSelectProps extends BaseSelectProps {
  value: string[];
  onChange(value: string[]): void;
  multiple: true;
  mixed?: false;
}

export type SelectProps = SingleSelectProps | MultipleSelectProps;

export default function Select({
  options,
  value,
  onChange,
  disabled,
  multiple,
  mixed,
  placeholder,
  className,
  ...rest
}: SelectProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (multiple) {
      onChange(Array.from(event.currentTarget.selectedOptions, option => option.value));
    } else {
      onChange(event.currentTarget.value);
    }
  };

  const classes = ['layoutpdf-select', className].filter(Boolean).join(' ');

  return (
    <select
      {...rest}
      className={classes}
      value={mixed ? '' : value}
      disabled={disabled}
      multiple={multiple}
      onChange={handleChange}
      data-mixed={mixed || undefined}
    >
      {mixed ? <option value="" disabled>{placeholder || t('property.panel.mixedValue')}</option> : null}
      {options.map(option => (
        <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
      ))}
    </select>
  );
}
