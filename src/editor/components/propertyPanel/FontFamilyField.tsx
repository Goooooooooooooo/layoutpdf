import { createContext, useContext } from 'react';
import type { FontFamilyInfo } from '@/engine/pdf/font/fontManager.js';
import Input from '@/ui/input/Input.js';
import Select from '@/ui/select/Select.js';
import { t } from '@/i18n/index.js';
import { resolveFontSelection } from './fontSelection.js';

/**
 * Families the designer can offer. Undefined means the font manager cannot
 * enumerate them, and the field falls back to free-text font names.
 */
export const FontFamiliesContext = createContext<readonly FontFamilyInfo[] | undefined>(undefined);

export function useFontFamilies(): readonly FontFamilyInfo[] | undefined {
  return useContext(FontFamiliesContext);
}

export function FontFamilyField({
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
  const families = useFontFamilies();
  const current = typeof value === 'string' ? value : '';
  if (!families || families.length === 0) {
    return (
      <Input
        id={id}
        type="text"
        value={current}
        mixed={mixed}
        disabled={disabled}
        placeholder={t('property.option.fontInherit')}
        onChange={next => onChange(String(next ?? ''))}
      />
    );
  }
  const selection = resolveFontSelection(families, current, t('property.option.fontInherit'));
  return (
    <Select
      id={id}
      value={selection.value}
      mixed={mixed}
      disabled={disabled}
      options={selection.options}
      onChange={onChange}
    />
  );
}
