import type { InputHTMLAttributes, Ref } from 'react';
import IconButton from '@/ui/button/IconButton.js';
import Icon from '@/ui/icon/Icon.js';
import { t } from '@/i18n/index.js';
import { useNumberDraft } from '@/ui/input/useNumberDraft.js';

export interface InputProps {
  type?: 'text' | 'number' | 'color';
  value: unknown;
  mixed?: boolean;
  disabled?: boolean;
  id?: string;
  min?: number;
  max?: number;
  step?: number;
  clearable?: boolean;
  suggestions?: string[];
  issue?: string;
  placeholder?: string;
  onChange(value: string | number | null): void;
  onClear?(): void;
}

export default function Input({
  type = 'text', value, mixed, disabled, id, min, max, step, clearable,
  suggestions, issue, placeholder, onChange, onClear,
}: InputProps) {
  const isColor = type === 'color';
  const valueIsEmpty = isColor && clearable && (value === null || value === undefined) && !mixed;
  const numberDraft = useNumberDraft(
    typeof value === 'number' ? value : null,
    next => { if (next !== null) onChange(next); },
  );

  const inputValue = mixed && !isColor ? '' :
    typeof value === 'string' || typeof value === 'number' ? value : '';
  const renderedValue = isColor
    ? (value as string) ?? ''
    : type === 'number'
      ? (mixed && !numberDraft.editing ? '' : numberDraft.displayValue)
      : inputValue;
  const input = (
    <input
      id={id}
      type={type}
      className={valueIsEmpty ? 'layoutpdf-color-empty' : undefined}
      list={suggestions?.length ? `${id}-suggestions` : undefined}
      aria-invalid={issue ? true : undefined}
      aria-describedby={issue ? `${id}-issue` : undefined}
      value={renderedValue}
      placeholder={mixed ? t('property.panel.mixedValue') : placeholder}
      data-mixed={mixed || undefined}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onFocus={type === 'number' ? () => numberDraft.handleFocus(mixed ? '' : undefined) : undefined}
      onBlur={type === 'number' ? numberDraft.handleBlur : undefined}
      onChange={event => {
        if (type === 'number') {
          numberDraft.handleChange(event.currentTarget.value);
          return;
        }
        onChange(event.currentTarget.value);
      }}
    />
  );

  if (isColor && valueIsEmpty && onClear) {
    return (
      <span className="layoutpdf-color-empty-group">
        {input}
        <IconButton
          size="sm"
          disabled={disabled}
          aria-label={t('property.panel.clearProperty', { label: placeholder ?? '' })}
          onClick={onClear}
        >
          <Icon name="x" size={12} />
        </IconButton>
      </span>
    );
  }

  if (!suggestions?.length && !issue) return input;
  return (
    <div className="layoutpdf-property-control">
      {input}
      {suggestions?.length ? (
        <datalist id={`${id}-suggestions`}>
          {suggestions.map(suggestion => <option key={suggestion} value={suggestion} />)}
        </datalist>
      ) : null}
      {issue ? <small id={`${id}-issue`} role="alert">{issue}</small> : null}
    </div>
  );
}

type SharedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'>;

export interface TextInputProps extends SharedInputProps {
  value: string;
  onValueChange(value: string): void;
  ref?: Ref<HTMLInputElement>;
}

export function TextInput({ value, onValueChange, ...props }: TextInputProps) {
  return <input {...props} type="text" value={value} onChange={event => onValueChange(event.currentTarget.value)} />;
}

export interface NumberInputProps extends SharedInputProps {
  value: number | null;
  onValueChange(value: number | null): void;
}

export function NumberInput({ value, onValueChange, ...props }: NumberInputProps) {
  const numberDraft = useNumberDraft(value, onValueChange);
  return (
    <input
      {...props}
      type="number"
      value={numberDraft.displayValue}
      onFocus={() => numberDraft.handleFocus()}
      onBlur={numberDraft.handleBlur}
      onChange={event => numberDraft.handleChange(event.currentTarget.value)}
    />
  );
}

export interface CheckboxInputProps extends Omit<SharedInputProps, 'checked'> {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
}

export function CheckboxInput({ checked, onCheckedChange, ...props }: CheckboxInputProps) {
  return (
    <input
      {...props}
      type="checkbox"
      checked={checked}
      onChange={event => onCheckedChange(event.currentTarget.checked)}
    />
  );
}
