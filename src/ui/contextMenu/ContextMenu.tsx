import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  divider?: boolean;
  danger?: boolean;
  onClick?(): void;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  anchor?: { left: number; right: number; bottom: number };
  items: ContextMenuItem[];
  onClose(): void;
}

export function ContextMenu({ x, y, anchor, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef<number>(-1);

  const focusItem = useCallback((index: number) => {
    const menu = menuRef.current;
    if (!menu) return;
    const buttons = menu.querySelectorAll<HTMLButtonElement>('.layoutpdf-context-menu-item:not([disabled])');
    const target = buttons[index >= 0 ? index : 0];
    if (target) {
      target.focus();
      activeIndexRef.current = index;
    }
  }, []);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (['Escape', 'ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
        // Menu navigation must not leak into canvas shortcuts (Escape would clear selection).
        event.stopPropagation();
      }
      const enabledItems = items.filter(item => !item.disabled && !item.divider);
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = activeIndexRef.current < enabledItems.length - 1
          ? activeIndexRef.current + 1
          : 0;
        focusItem(next);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        const prev = activeIndexRef.current > 0
          ? activeIndexRef.current - 1
          : enabledItems.length - 1;
        focusItem(prev);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const item = enabledItems[activeIndexRef.current];
        if (item?.onClick) {
          item.onClick();
          onClose();
        }
      }
    };
    menu.addEventListener('keydown', onKeyDown);
    focusItem(0);
    return () => menu.removeEventListener('keydown', onKeyDown);
  }, [items, onClose, focusItem]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const preferredLeft = anchor ? anchor.right - rect.width : x;
    const preferredTop = anchor ? anchor.bottom + 4 : y;
    menu.style.left = `${Math.max(8, Math.min(preferredLeft, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(preferredTop, window.innerHeight - rect.height - 8))}px`;
  }, [anchor, x, y]);

  const hasVisibleItems = items.some(item => !item.divider);
  if (!hasVisibleItems) return null;

  return (
    <>
      <div className="layoutpdf-context-menu-backdrop" onPointerDown={onClose} />
      <div
        ref={menuRef}
        className="layoutpdf-context-menu"
        style={{ left: x, top: y }}
        role="menu"
      >
        {items.map(item => (
          item.divider
            ? <div key={item.id} className="layoutpdf-context-menu-divider" role="separator" />
            : (
              <button
                key={item.id}
                className={`layoutpdf-context-menu-item${item.danger ? ' layoutpdf-context-menu-item-danger' : ''}`}
                disabled={item.disabled}
                role="menuitem"
                onClick={() => {
                  item.onClick?.();
                  onClose();
                }}
                onMouseEnter={event => {
                  (event.currentTarget as HTMLElement).focus();
                }}
              >
                <span className="layoutpdf-context-menu-label">{item.label}</span>
                {item.shortcut ? <span className="layoutpdf-context-menu-shortcut">{item.shortcut}</span> : null}
              </button>
            )
        ))}
      </div>
    </>
  );
}
