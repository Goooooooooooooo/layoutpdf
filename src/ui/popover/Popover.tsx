import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

export interface PopoverProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  id?: string;
  className?: string;
  role?: string;
  ariaLabel?: string;
  align?: 'start' | 'end';
  backdrop?: boolean;
  children: ReactNode;
  onClose(): void;
}

export default function Popover({
  open,
  anchorRef,
  id,
  className,
  role,
  ariaLabel,
  align = 'start',
  backdrop = true,
  children,
  onClose,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    let left = align === 'end' ? rect.right - width : rect.left;
    let top = rect.bottom + 4;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }, [open, anchorRef, align]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open || !anchorRef.current) return null;

  return (
    <>
      {backdrop ? <div className="layoutpdf-popover-backdrop" onPointerDown={onClose} /> : null}
      <div
        ref={panelRef}
        id={id}
        className={['layoutpdf-popover', className].filter(Boolean).join(' ')}
        role={role}
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </>
  );
}
