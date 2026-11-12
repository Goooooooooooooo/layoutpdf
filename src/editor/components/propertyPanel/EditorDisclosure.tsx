import type { ReactNode } from 'react';
import Disclosure from '@/ui/disclosure/Disclosure.js';

export default function EditorDisclosure({
  variant,
  groupName,
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  variant: 'section' | 'item';
  groupName?: string;
  title: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Disclosure
      className={`layoutpdf-table-editor-${variant}`}
      name={groupName}
      title={title}
      meta={meta}
      titleWrapper={variant === 'item'}
      defaultOpen={defaultOpen}
    >
      {children}
    </Disclosure>
  );
}
