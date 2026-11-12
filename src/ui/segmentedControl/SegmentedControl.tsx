import type { IconName } from '@/ui/icon/Icon.js';
import Icon from '@/ui/icon/Icon.js';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  badge?: number;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedControlOption<T>[];
  mixed?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  onChange(value: T): void;
}

export default function SegmentedControl<T extends string>({
  value,
  options,
  mixed,
  disabled,
  className,
  'aria-label': ariaLabel,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`layoutpdf-segmented-control${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map(option => {
        const isActive = option.value === value && !mixed;
        return (
          <button
            key={option.value}
            type="button"
            className="layoutpdf-segmented-control-item"
            data-active={isActive || undefined}
            data-mixed={mixed || undefined}
            disabled={disabled || option.disabled}
            role="radio"
            aria-checked={isActive}
            title={option.icon ? option.label : undefined}
            onClick={() => onChange(option.value)}
          >
            {option.icon ? (
              <Icon name={option.icon} size={14} />
            ) : (
              <>
                <span className="layoutpdf-segmented-label">{option.label}</span>
                {option.badge === undefined ? null : (
                  <span className="layoutpdf-segmented-badge" aria-hidden="true">{option.badge}</span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
