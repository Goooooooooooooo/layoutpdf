import Icon, { type IconName } from '@/ui/icon/Icon.js';

export interface MenuItemProps {
  id: string;
  label: string;
  icon?: IconName;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export interface MenuItemDescriptor extends MenuItemProps {}

export default function MenuItem({ label, icon, active, disabled, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      className="layoutpdf-sidebar-item"
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon ? <span className="layoutpdf-sidebar-item-icon"><Icon name={icon} size={20} /></span> : null}
      <span className="layoutpdf-sidebar-item-label">{label}</span>
    </button>
  );
}

export type { IconName };