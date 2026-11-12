import { useEffect, useState, type KeyboardEvent } from 'react';
import { t } from '@/i18n/index.js';
import { evaluateNumericExpression } from './numericExpression.js';

interface InspectorUnitInputProps {
  value: number | null;
  label: string;
  prefix: string;
  unit: string;
  resetKey: string;
  historyGroup: string;
  mixed?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  onChange(value: number): void;
  onEndHistoryGroup(group: string): void;
  onCancelHistoryGroup(group: string): void;
}

export default function InspectorUnitInput({
  value,
  label,
  prefix,
  unit,
  resetKey,
  historyGroup,
  mixed,
  disabled,
  min,
  max,
  onChange,
  onEndHistoryGroup,
  onCancelHistoryGroup,
}: InspectorUnitInputProps) {
  const [draft, setDraft] = useState<string>();
  const displayValue = draft ?? (mixed || value === null ? '' : String(value));
  const parsedValue = evaluateNumericExpression(displayValue);
  const invalid = draft !== undefined
    && draft.trim() !== ''
    && (parsedValue === undefined
      || (min !== undefined && parsedValue < min)
      || (max !== undefined && parsedValue > max));

  useEffect(() => {
    setDraft(currentDraft => {
      if (currentDraft === undefined) return undefined;
      if (!mixed && value !== null && evaluateNumericExpression(currentDraft) === value) {
        return currentDraft;
      }
      // External selection/undo changes must replace a stale local draft.
      return undefined;
    });
  }, [mixed, value]);

  useEffect(() => {
    // A new selection can have the same numeric value, so value alone cannot invalidate its draft.
    setDraft(undefined);
  }, [resetKey]);

  const finishEditing = () => setDraft(undefined);
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
  };

  return (
    <label
      className="layoutpdf-inspector-unit-field"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onEndHistoryGroup(historyGroup);
        }
      }}
      onKeyDownCapture={event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onCancelHistoryGroup(historyGroup);
        setDraft(undefined);
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      <span className="layoutpdf-inspector-unit-prefix" aria-hidden="true">{prefix}</span>
      <input
        type="text"
        role="spinbutton"
        inputMode="decimal"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={!mixed && value !== null ? value : undefined}
        aria-invalid={invalid || undefined}
        data-mixed={mixed || undefined}
        value={displayValue}
        placeholder={mixed ? t('property.panel.mixedValue') : undefined}
        disabled={disabled}
        onFocus={() => setDraft(mixed || value === null ? '' : String(value))}
        onBlur={finishEditing}
        onKeyDown={handleKeyDown}
        onChange={event => {
          const nextDraft = event.currentTarget.value;
          setDraft(nextDraft);
          const next = evaluateNumericExpression(nextDraft);
          if (next === undefined) return;
          if (min !== undefined && next < min) return;
          if (max !== undefined && next > max) return;
          onChange(next);
        }}
      />
      <span className="layoutpdf-inspector-unit-suffix" aria-hidden="true">{unit}</span>
    </label>
  );
}
