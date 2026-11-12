import { forwardRef, type ButtonHTMLAttributes } from 'react';
import Tooltip from '@/ui/tooltip/Tooltip.js';

export type IconButtonVariant = 'default' | 'danger' | 'active';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  tooltip?: string;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  variant = 'default',
  size = 'md',
  className,
  type = 'button',
  title,
  tooltip,
  tooltipSide = 'bottom',
  ...props
}: IconButtonProps, ref) {
  const classes = [
    'layoutpdf-icon-button',
    `layoutpdf-icon-button-${size}`,
    variant !== 'default' ? `layoutpdf-icon-button-${variant}` : undefined,
    className,
  ].filter(Boolean).join(' ');

  const button = (
    <button
      {...props}
      ref={ref}
      type={type}
      className={classes}
      aria-label={props['aria-label'] ?? tooltip ?? title}
    />
  );

  if (tooltip) {
    return (
      <Tooltip label={tooltip} side={tooltipSide}>
        {button}
      </Tooltip>
    );
  }
  return button;
});

export default IconButton;
