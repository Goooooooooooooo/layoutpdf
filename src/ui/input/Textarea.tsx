import { t } from '@/i18n/index.js';

export interface TextareaProps {
  value: string;
  mixed?: boolean;
  disabled?: boolean;
  id?: string;
  rows?: number;
  placeholder?: string;
  onChange(value: string): void;
}

export default function Textarea({
  value,
  mixed,
  disabled,
  id,
  rows = 3,
  placeholder,
  onChange,
}: TextareaProps) {
  return (
    <textarea
      id={id}
      value={mixed ? '' : value}
      placeholder={placeholder || (mixed ? t('property.panel.mixedValue') : undefined)}
      disabled={disabled}
      rows={rows}
      onChange={event => onChange(event.currentTarget.value)}
    />
  );
}
