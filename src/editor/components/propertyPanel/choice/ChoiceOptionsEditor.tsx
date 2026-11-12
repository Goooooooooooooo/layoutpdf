import { useState } from 'react';
import type { ChoiceOption } from '@/plugins/choiceShared.js';
import Button from '@/ui/button/Button.js';
import { TextInput } from '@/ui/input/Input.js';
import { StructuredField } from '@/editor/components/propertyPanel/PropertyField.js';
import { t } from '@/i18n/index.js';

function uniqueValue(options: readonly ChoiceOption[]): string {
  const used = new Set(options.map(option => option.value));
  let index = options.length + 1;
  while (used.has(`option_${index}`)) index += 1;
  return `option_${index}`;
}

function updateOption(
  options: readonly ChoiceOption[],
  index: number,
  patch: Partial<ChoiceOption>,
): ChoiceOption[] {
  return options.map((option, current) => current === index ? { ...option, ...patch } : { ...option });
}

function moveOption(options: readonly ChoiceOption[], index: number, direction: -1 | 1): ChoiceOption[] {
  const target = index + direction;
  if (target < 0 || target >= options.length) return options.map(option => ({ ...option }));
  const next = options.map(option => ({ ...option }));
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function ChoiceOptionsEditor({
  options,
  disabled,
  onChange,
}: {
  options: ChoiceOption[];
  disabled: boolean;
  onChange(options: ChoiceOption[]): void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const index = Math.min(selectedIndex, Math.max(0, options.length - 1));
  const active = options[index];

  return (
    <div className="layoutpdf-structured-editor">
      <div className="layoutpdf-table-list" role="listbox" aria-label={t('property.choice.options')}>
        {options.map((option, optionIndex) => (
          <button
            key={`${option.value}:${optionIndex}`}
            type="button"
            role="option"
            aria-selected={optionIndex === index}
            className="layoutpdf-table-list-item"
            data-active={optionIndex === index || undefined}
            disabled={disabled}
            onClick={() => setSelectedIndex(optionIndex)}
          >
            <span>{optionIndex + 1}. {option.label}</span>
            <small>{option.value}</small>
          </button>
        ))}
      </div>
      {active ? (
        <div className="layoutpdf-table-list-detail layoutpdf-choice-option-detail">
          <div className="layoutpdf-choice-option-fields">
            <StructuredField label={t('property.choice.optionLabel')}>
              <TextInput
                value={active.label}
                disabled={disabled}
                aria-label={t('property.choice.optionLabelAria', { index: index + 1 })}
                onValueChange={label => onChange(updateOption(options, index, { label }))}
              />
            </StructuredField>
            <StructuredField label={t('property.choice.optionValue')}>
              <TextInput
                value={active.value}
                disabled={disabled}
                aria-label={t('property.choice.optionValueAria', { index: index + 1 })}
                onValueChange={value => onChange(updateOption(options, index, { value }))}
              />
            </StructuredField>
          </div>
          <div className="layoutpdf-choice-option-actions">
            <Button
              size="compact"
              disabled={disabled || index === 0}
              onClick={() => {
                onChange(moveOption(options, index, -1));
                setSelectedIndex(index - 1);
              }}
            >
              {t('property.choice.movePrevious')}
            </Button>
            <Button
              size="compact"
              disabled={disabled || index >= options.length - 1}
              onClick={() => {
                onChange(moveOption(options, index, 1));
                setSelectedIndex(index + 1);
              }}
            >
              {t('property.choice.moveNext')}
            </Button>
            <Button
              size="compact"
              variant="danger"
              disabled={disabled || options.length <= 1}
              onClick={() => {
                onChange(options.filter((_, optionIndex) => optionIndex !== index).map(option => ({ ...option })));
                setSelectedIndex(Math.max(0, index - 1));
              }}
            >
              {t('common.delete')}
            </Button>
          </div>
        </div>
      ) : null}
      <Button
        size="compact"
        disabled={disabled || options.length >= 100}
        onClick={() => {
          const value = uniqueValue(options);
          onChange([...options.map(option => ({ ...option })), {
            label: t('property.choice.newOption', { index: options.length + 1 }),
            value,
          }]);
          setSelectedIndex(options.length);
        }}
      >
        {t('property.choice.addOption')}
      </Button>
    </div>
  );
}
