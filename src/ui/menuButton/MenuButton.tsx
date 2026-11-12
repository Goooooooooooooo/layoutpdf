import { type ReactNode, useEffect, useRef, useState } from 'react';
import IconButton, { type IconButtonSize } from '@/ui/button/IconButton.js';
import { ContextMenu, type ContextMenuItem } from '@/ui/contextMenu/ContextMenu.js';
import Icon, { type IconName } from '@/ui/icon/Icon.js';

export interface MenuButtonProps {
  items: ContextMenuItem[];
  label: string;
  title?: string;
  icon?: IconName;
  disabled?: boolean;
  className?: string;
  onOpen?(): void;
  children?: ReactNode;
  size?: IconButtonSize;
}

export default function MenuButton({
  items, label, title = label, icon = 'more-horizontal', disabled, className, onOpen, children, size = 'sm',
}: MenuButtonProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; right: number; bottom: number }>();

  useEffect(() => {
    if (!anchor) return;
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        setAnchor(undefined);
        return;
      }
      setAnchor({ left: rect.left, right: rect.right, bottom: rect.bottom });
    };
    // Property panels can scroll while a menu is open; keep the menu attached to its trigger.
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [anchor]);

  return (
    <span className={className}>
      <IconButton
        ref={triggerRef}
        size={size}
        title={title}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        disabled={disabled}
        onClick={() => {
          if (anchor) {
            setAnchor(undefined);
            return;
          }
          const rect = triggerRef.current?.getBoundingClientRect();
          if (!rect) return;
          onOpen?.();
          setAnchor({ left: rect.left, right: rect.right, bottom: rect.bottom });
        }}
      >
        {children ?? <Icon name={icon} size={14} />}
      </IconButton>
      {anchor ? (
        <ContextMenu
          x={anchor.left}
          y={anchor.bottom + 4}
          anchor={anchor}
          items={items}
          onClose={() => {
            setAnchor(undefined);
            triggerRef.current?.focus();
          }}
        />
      ) : null}
    </span>
  );
}
