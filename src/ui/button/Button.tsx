import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'compact' | 'default';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isBusy?: boolean;
}

export default function Button({
  variant = 'secondary',
  size = 'default',
  isBusy = false,
  className,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = [
    'layoutpdf-button',
    `layoutpdf-button-${variant}`,
    `layoutpdf-button-${size}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      {...props}
      type={type}
      className={classes}
      disabled={disabled || isBusy}
      aria-busy={isBusy || undefined}
    />
  );
}
