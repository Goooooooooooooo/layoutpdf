import type { HTMLAttributes, ReactNode } from 'react';

export interface ContextToolbarProps extends HTMLAttributes<HTMLElement> {
  leading?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
}

export default function ContextToolbar({
  leading,
  center,
  actions,
  className,
  ...props
}: ContextToolbarProps) {
  const classes = ['layoutpdf-context-toolbar', className].filter(Boolean).join(' ');
  return (
    <div {...props} className={classes} role="toolbar">
      {leading ? <div className="layoutpdf-context-toolbar-leading">{leading}</div> : null}
      {center ? <div className="layoutpdf-context-toolbar-center">{center}</div> : null}
      {actions ? <div className="layoutpdf-context-toolbar-actions">{actions}</div> : null}
    </div>
  );
}