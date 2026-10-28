import {
  LayoutDashboard,
  FileStack,
  Package,
  ShoppingCart,
  CalendarDays,
  MapPin,
  PenLine,
  Ticket,
  BarChart3,
  History,
  Images,
  FolderTree,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Sidebar order is fixed by the brief + workbench additions. */
export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Pages', href: '/admin/pages', icon: FileStack },
  { label: 'Products', href: '/admin/products', icon: Package },
  { label: 'Categories', href: '/admin/categories', icon: FolderTree },
  { label: 'Orders', href: '/admin/orders', icon: ShoppingCart },
  { label: 'Events', href: '/admin/events', icon: CalendarDays },
  { label: 'Tracker', href: '/admin/tracker', icon: MapPin },
  { label: 'Blog', href: '/admin/blog', icon: PenLine },
  { label: 'Media', href: '/admin/media', icon: Images },
  { label: 'Promo Codes', href: '/admin/promo-codes', icon: Ticket },
  { label: 'History', href: '/admin/history', icon: History },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];
