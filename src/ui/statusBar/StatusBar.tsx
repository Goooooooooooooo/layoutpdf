import type { HTMLAttributes, ReactNode } from 'react';

export interface StatusBarProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export default function StatusBar({ className, children, ...props }: StatusBarProps) {
  return <footer {...props} className={`layoutpdf-status-bar${className ? ` ${className}` : ''}`}>{children}</footer>;
}
