'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { navItems } from './nav';
import { cn } from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();

  const nav = (
    <nav className="flex-1 overflow-y-auto py-4" aria-label="Admin sections">
      <ul className="space-y-0.5 px-2">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onCloseMobile}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-11 items-center gap-3 rounded-[4px] px-3 text-sm transition-colors',
                  active
                    ? 'bg-paper-12 text-paper'
                    : 'text-paper-60 hover:bg-paper-12 hover:text-paper',
                  collapsed && 'justify-center px-0'
                )}
              >
                {/* active indicator: 2px vermilion left bar */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 bg-vermilion"
                  />
                )}
                <Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
                {!collapsed && <span>{item.label}</span>}
                {collapsed && (
                  <span className="sr-only">{item.label}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const header = (
    <div className="flex h-16 items-center justify-between border-b border-line px-4">
      <Link href="/admin/dashboard" className="flex items-baseline gap-1.5">
        <span className="font-display text-lg tracking-tight text-paper">Cra7ty Hub</span>
        {!collapsed && (
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-kraft-60">
            admin
          </span>
        )}
      </Link>
      {!collapsed && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse sidebar"
          className="hidden rounded-[4px] p-1.5 text-paper-60 hover:bg-paper-12 hover:text-paper md:block"
        >
          <PanelLeftClose size={16} />
        </button>
      )}
    </div>
  );

  const expandedFooter = !collapsed && (
    <div className="hidden border-t border-line p-2 md:block">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-10 w-full items-center gap-3 rounded-[4px] px-3 text-sm text-paper-60 hover:bg-paper-12 hover:text-paper"
      >
        <PanelLeftOpen size={16} />
        <span>Expand</span>
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop: fixed left rail, 220px expanded / 56px icon-only */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface transition-[width] duration-200 ease-paper md:flex',
          collapsed ? 'w-14' : 'w-[220px]'
        )}
      >
        {header}
        {nav}
        {expandedFooter}
      </aside>

      {/* Collapsed: expand affordance in the strip */}
      {collapsed && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          className="fixed left-0 top-3 z-40 hidden rounded-[4px] p-1.5 text-paper-60 hover:bg-paper-12 hover:text-paper md:block"
          style={{ left: '14px' }}
        >
          <PanelLeftOpen size={16} />
        </button>
      )}

      {/* Mobile: bottom sheet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-label="Admin menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={onCloseMobile}
            className="absolute inset-0"
            style={{ background: 'rgba(15,15,15,0.7)' }}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-[4px] border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <span className="font-display text-lg text-paper">Cra7ty Hub</span>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close menu"
                className="rounded-[4px] p-2.5 text-paper-60 hover:bg-paper-12"
              >
                <X size={18} />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}
    </>
  );
}
