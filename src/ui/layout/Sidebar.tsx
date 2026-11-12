import Tooltip from '@/ui/tooltip/Tooltip.js';
import MenuItem, { type MenuItemDescriptor } from '@/ui/navigation/MenuItem.js';

export interface SidebarProps {
  items: MenuItemDescriptor[];
  className?: string;
  'aria-label'?: string;
}

export default function Sidebar({ items, className, 'aria-label': ariaLabel }: SidebarProps) {
  const classes = ['layoutpdf-sidebar', className].filter(Boolean).join(' ');
  return (
    <nav className={classes} aria-label={ariaLabel}>
      {items.map(item => (
        <Tooltip key={item.id} label={item.label} side="right" className="layoutpdf-sidebar-item-tooltip">
          <MenuItem {...item} />
        </Tooltip>
      ))}
    </nav>
  );
}

export { MenuItemDescriptor };