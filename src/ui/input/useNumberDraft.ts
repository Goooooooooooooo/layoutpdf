import { useState } from 'react';
import { parseNumberInputValue } from '@/ui/input/inputValue.js';

export interface NumberDraft {
  editing: boolean;
  displayValue: string;
  handleFocus(initial?: string): void;
  handleChange(raw: string): void;
  handleBlur(): void;
}

export function useNumberDraft(
  value: number | null,
  onCommit: (value: number | null) => void,
): NumberDraft {
  const [draft, setDraft] = useState<string | null>(null);
  const committed = value === null ? '' : String(value);
  return {
    editing: draft !== null,
    displayValue: draft ?? committed,
    handleFocus: initial => setDraft(initial ?? committed),
    handleChange: raw => {
      setDraft(raw);
      onCommit(parseNumberInputValue(raw));
    },
    handleBlur: () => setDraft(null),
  };
}
