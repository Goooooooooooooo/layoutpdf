import { useEffect, useState } from 'react';
import { t } from '@/i18n/index.js';

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export default function InspectorColorField({
  id,
  value,
  mixed,
  disabled,
  onChange,
}: {
  id: string;
  value: unknown;
  mixed: boolean;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const hasColor = typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
  const color = hasColor ? value : '#000000';
  const empty = !mixed && !hasColor;
  const [draft, setDraft] = useState(mixed || empty ? '' : color);
  const invalid = draft !== '' && !HEX_COLOR_PATTERN.test(draft);

  useEffect(() => {
    setDraft(mixed || empty ? '' : color);
  }, [color, empty, mixed]);

  return (
    <span className="layoutpdf-inspector-color-field">
      <label className="layoutpdf-inspector-color-swatch" data-empty={empty || undefined}>
        <input
          type="color"
          aria-label={t('property.panel.chooseColor')}
          value={color}
          disabled={disabled}
          onChange={event => {
            setDraft(event.currentTarget.value);
            onChange(event.currentTarget.value);
          }}
        />
        <span
          aria-hidden="true"
          style={empty ? undefined : { backgroundColor: color }}
        />
      </label>
      <input
        id={id}
        type="text"
        value={draft}
        placeholder={mixed ? t('property.panel.mixedValue') : empty ? t('property.panel.noFill') : '#000000'}
        aria-invalid={invalid || undefined}
        data-mixed={mixed || undefined}
        disabled={disabled}
        onBlur={() => setDraft(mixed || empty ? '' : color)}
        onChange={event => {
          const next = event.currentTarget.value;
          setDraft(next);
          if (HEX_COLOR_PATTERN.test(next)) onChange(next);
        }}
      />
    </span>
  );
}
