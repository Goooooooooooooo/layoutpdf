import type { HTMLAttributes, ReactNode } from 'react';

export interface PageHeaderProps extends HTMLAttributes<HTMLElement> {
  leading: ReactNode;
  actions?: ReactNode;
}

export default function PageHeader({
  leading,
  actions,
  children,
  className,
  ...props
}: PageHeaderProps) {
  const classes = ['layoutpdf-page-header', className].filter(Boolean).join(' ');

  return (
    <header {...props} className={classes}>
      <div className="layoutpdf-page-header-leading">{leading}</div>
      {children ? <div className="layoutpdf-page-header-content">{children}</div> : null}
      {actions ? <div className="layoutpdf-page-header-actions">{actions}</div> : null}
    </header>
  );
}
