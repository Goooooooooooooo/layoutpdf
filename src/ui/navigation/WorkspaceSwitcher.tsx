export type WorkspaceMode = 'designer' | 'runner';

export interface WorkspaceSwitcherOption {
  value: WorkspaceMode;
  label: string;
}

export interface WorkspaceSwitcherProps {
  value: WorkspaceMode;
  options: WorkspaceSwitcherOption[];
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  onChange(value: WorkspaceMode): void;
}

export default function WorkspaceSwitcher({
  value,
  options,
  disabled,
  className,
  'aria-label': ariaLabel,
  onChange,
}: WorkspaceSwitcherProps) {
  const activeIndex = options.findIndex(option => option.value === value);
  return (
    <div
      className={`layoutpdf-workspace-switcher${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
      data-active-index={Math.max(0, activeIndex)}
      data-count={options.length}
    >
      <span className="layoutpdf-workspace-switcher-thumb" aria-hidden="true" />
      {options.map((option, index) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className="layoutpdf-workspace-switcher-item"
            data-active={isActive || undefined}
            disabled={disabled}
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            style={{ zIndex: index === activeIndex ? 2 : 1 }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}