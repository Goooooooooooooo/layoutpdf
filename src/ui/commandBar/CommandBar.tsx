import type { HTMLAttributes, ReactNode } from 'react';

export interface CommandBarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export default function CommandBar({ className, children, ...props }: CommandBarProps) {
  return <div {...props} className={`layoutpdf-command-bar${className ? ` ${className}` : ''}`}>{children}</div>;
}
