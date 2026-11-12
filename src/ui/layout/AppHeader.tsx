import type { HTMLAttributes, ReactNode } from 'react';

export interface AppHeaderProps extends HTMLAttributes<HTMLElement> {
  leading?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
}

export default function AppHeader({
  leading,
  center,
  actions,
  className,
  ...props
}: AppHeaderProps) {
  const classes = ['layoutpdf-app-header', className].filter(Boolean).join(' ');
  return (
    <header {...props} className={classes}>
      <div className="layoutpdf-app-header-leading">{leading}</div>
      <div className="layoutpdf-app-header-center">{center}</div>
      <div className="layoutpdf-app-header-actions">{actions}</div>
    </header>
  );
}