import { useState, type ReactNode } from 'react';

export interface DisclosureProps {
  className?: string;
  name?: string;
  title: ReactNode;
  meta?: ReactNode;
  titleWrapper?: boolean;
  contentClassName?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function Disclosure({
  className, name, title, meta, titleWrapper, contentClassName, defaultOpen = false, children,
}: DisclosureProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <details
      className={className}
      name={name}
      open={isOpen}
      onToggle={event => setIsOpen(event.currentTarget.open)}
    >
      <summary>
        {titleWrapper ? <span>{title}</span> : title}
        {meta !== undefined ? <small>{meta}</small> : null}
      </summary>
      {contentClassName ? <div className={contentClassName}>{children}</div> : children}
    </details>
  );
}
