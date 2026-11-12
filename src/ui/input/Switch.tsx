import { useEffect, useRef } from 'react';

export interface SwitchProps {
  checked: boolean;
  mixed?: boolean;
  disabled?: boolean;
  id?: string;
  onChange(checked: boolean): void;
}

export default function Switch({
  checked,
  mixed,
  disabled,
  id,
  onChange,
}: SwitchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = Boolean(mixed);
  }, [mixed]);

  return (
    <span className="layoutpdf-switch">
      <input
        ref={inputRef}
        className="layoutpdf-switch-input"
        id={id}
        type="checkbox"
        checked={mixed ? false : checked}
        aria-checked={mixed ? 'mixed' : checked}
        data-mixed={mixed || undefined}
        disabled={disabled}
        onChange={event => onChange(event.currentTarget.checked)}
      />
      <span className="layoutpdf-switch-track" aria-hidden="true">
        <span className="layoutpdf-switch-thumb" />
      </span>
    </span>
  );
}
