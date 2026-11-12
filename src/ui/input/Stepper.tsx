import IconButton from '@/ui/button/IconButton.js';
import Icon from '@/ui/icon/Icon.js';
import { t } from '@/i18n/index.js';
import { useNumberDraft } from '@/ui/input/useNumberDraft.js';

export interface StepperProps {
  value: number;
  mixed?: boolean;
  disabled?: boolean;
  id?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange(value: number): void;
}

function clamp(value: number, min?: number, max?: number): number {
  let result = value;
  if (min !== undefined && result < min) result = min;
  if (max !== undefined && result > max) result = max;
  return result;
}

export default function Stepper({
  value,
  mixed,
  disabled,
  id,
  min,
  max,
  step = 1,
  onChange,
}: StepperProps) {
  const handleIncrement = () => onChange(clamp(value + step, min, max));
  const handleDecrement = () => onChange(clamp(value - step, min, max));
  const numberDraft = useNumberDraft(value, next => {
    if (next !== null) onChange(clamp(next, min, max));
  });

  return (
    <div className="layoutpdf-stepper">
      <input
        id={id}
        type="number"
        value={mixed && !numberDraft.editing ? '' : numberDraft.displayValue}
        placeholder={mixed ? t('property.panel.mixedValue') : undefined}
        data-mixed={mixed || undefined}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onFocus={() => numberDraft.handleFocus(mixed ? '' : undefined)}
        onBlur={numberDraft.handleBlur}
        onChange={event => numberDraft.handleChange(event.currentTarget.value)}
      />
      <IconButton
        size="sm"
        title={t('property.panel.increment')}
        aria-label={t('property.panel.increment')}
        disabled={disabled || mixed || (max !== undefined && value >= max)}
        onClick={handleIncrement}
      >
        <Icon name="plus" size={12} />
      </IconButton>
      <IconButton
        size="sm"
        title={t('property.panel.decrement')}
        aria-label={t('property.panel.decrement')}
        disabled={disabled || mixed || (min !== undefined && value <= min)}
        onClick={handleDecrement}
      >
        <Icon name="minus" size={12} />
      </IconButton>
    </div>
  );
}
