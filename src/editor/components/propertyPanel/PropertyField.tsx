import type { FocusEvent, KeyboardEvent, ReactNode } from 'react';
import type { JsonValue } from '@/engine/core/document.js';
import type { PropertyDefinition } from '@/engine/core/plugin.js';
import type { IconName } from '@/ui/icon/Icon.js';
import IconButton from '@/ui/button/IconButton.js';
import Icon from '@/ui/icon/Icon.js';
import Select from '@/ui/select/Select.js';
import Switch from '@/ui/input/Switch.js';
import Textarea from '@/ui/input/Textarea.js';
import Input from '@/ui/input/Input.js';
import Stepper from '@/ui/input/Stepper.js';
import SegmentedControl from '@/ui/segmentedControl/SegmentedControl.js';
import { resolveMessageLabel, t } from '@/i18n/index.js';
import Disclosure from '@/ui/disclosure/Disclosure.js';
import InspectorColorField from './InspectorColorField.js';

export function PropertyField({
  definition,
  value,
  mixed,
  disabled,
  suggestions,
  issue,
  historyGroup,
  resetDisabled,
  onChange,
  onReset,
  onEndHistoryGroup,
  onCancelHistoryGroup,
}: {
  definition: PropertyDefinition;
  value: unknown;
  mixed: boolean;
  disabled: boolean;
  suggestions?: string[];
  issue?: string;
  historyGroup: string;
  resetDisabled?: boolean;
  onChange(value: JsonValue, historyGroup: string): void;
  onReset?(historyGroup: string): void;
  onEndHistoryGroup(group: string): void;
  onCancelHistoryGroup(group: string): void;
}) {
  const id = `property-${definition.path.replaceAll('.', '-')}`;
  const definitionLabel = resolveMessageLabel(definition);
  let editor: ReactNode;
  if (definition.editor === 'switch') {
    editor = (
      <Switch
        id={id}
        checked={Boolean(value)}
        mixed={mixed}
        disabled={disabled}
        onChange={checked => onChange(checked, historyGroup)}
      />
    );
  } else if (definition.editor === 'color') {
    editor = (
      <InspectorColorField
        id={id}
        value={value}
        mixed={mixed}
        disabled={disabled}
        onChange={value => onChange(value, historyGroup)}
      />
    );
  } else if (definition.editor === 'select') {
    editor = (
      <Select
        id={id}
        value={String(value ?? '')}
        mixed={mixed}
        disabled={disabled}
        onChange={selectedValue => {
          const option = definition.options?.find(item => String(item.value) === selectedValue);
          onChange(option?.value ?? selectedValue, historyGroup);
        }}
        options={(definition.options ?? []).map(option => ({
          value: String(option.value),
          label: resolveMessageLabel(option),
        }))}
      />
    );
  } else if (definition.editor === 'textarea') {
    editor = (
      <Textarea
        id={id}
        value={typeof value === 'string' ? value : ''}
        mixed={mixed}
        disabled={disabled}
        onChange={val => onChange(val, historyGroup)}
      />
    );
  } else if (definition.editor === 'stepper') {
    editor = (
      <Stepper
        id={id}
        value={typeof value === 'number' ? value : Number(value) || 0}
        mixed={mixed}
        disabled={disabled}
        min={definition.min}
        max={definition.max}
        step={definition.step}
        onChange={val => onChange(val, historyGroup)}
      />
    );
  } else if (definition.editor === 'button-group') {
    editor = (
      <SegmentedControl
        value={String(value ?? '')}
        mixed={mixed}
        disabled={disabled}
        options={(definition.options ?? []).map(option => ({
          value: String(option.value),
          label: resolveMessageLabel(option),
          icon: option.icon as IconName | undefined,
        }))}
        onChange={val => onChange(val, historyGroup)}
      />
    );
  } else {
    editor = (
      <Input
        id={id}
        type={definition.editor === 'number' ? 'number' : 'text'}
        value={value}
        mixed={mixed}
        disabled={disabled}
        min={definition.min}
        max={definition.max}
        step={definition.step}
        clearable={definition.cleareable}
        suggestions={suggestions}
        issue={issue}
        onChange={val => onChange(val, historyGroup)}
      />
    );
  }
  const showClear = definition.cleareable && value !== null && value !== undefined && !mixed;
  const showReset = Boolean(onReset) && !resetDisabled;
  const stacked = definition.editor === 'textarea';
  return (
    <div
      className={`layoutpdf-property-field${stacked ? ' stacked' : ''}`}
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onEndHistoryGroup(historyGroup);
        }
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onCancelHistoryGroup(historyGroup);
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      <label htmlFor={id}>{definitionLabel}</label>
      {editor}
      <div className="layoutpdf-property-actions">
        {showClear ? (
          <IconButton
            size="sm"
            title={t('property.panel.clearProperty', { label: definitionLabel })}
            aria-label={t('property.panel.clearProperty', { label: definitionLabel })}
            disabled={disabled}
            onClick={() => onChange(null, historyGroup)}
          >
            <Icon name="x" size={14} />
          </IconButton>
        ) : null}
        {showReset ? (
          <IconButton
            size="sm"
            title={t('property.panel.resetProperty', { label: definitionLabel })}
            aria-label={t('property.panel.resetProperty', { label: definitionLabel })}
            disabled={disabled}
            onClick={() => onReset?.(historyGroup)}
          >
            <Icon name="reset" size={14} />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}

export function PropertyGroup({
  label,
  count,
  defaultOpen,
  children,
}: {
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Disclosure
      className="layoutpdf-property-group"
      title={label}
      titleWrapper
      meta={count}
      defaultOpen={defaultOpen}
      contentClassName="layoutpdf-property-group-content"
    >
      {children}
    </Disclosure>
  );
}

export function StructuredField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="layoutpdf-structured-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
