'use client';

import { usePathname } from 'next/navigation';
import { Bell, Menu } from 'lucide-react';
import { navItems } from './nav';

const detailTitles = (pathname: string): string | null => {
  const product = pathname.match(/^\/admin\/products\/([^/]+)$/);
  if (product) return product[1] === 'new' ? 'New product' : 'Edit product';
  const order = pathname.match(/^\/admin\/orders\/([^/]+)$/);
  if (order) return `Order #${order[1]}`;
  const post = pathname.match(/^\/admin\/blog\/([^/]+)$/);
  if (post) return post[1] === 'new' ? 'New post' : 'Edit post';
  return null;
};

export function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const pathname = usePathname();

  const fromNav = navItems.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/')
  );
  const title = detailTitles(pathname) ?? fromNav?.label ?? 'Admin';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur md:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobile}
          aria-label="Open menu"
          className="rounded-[4px] p-2.5 text-paper-70 hover:bg-paper-12 md:hidden"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-base font-medium text-paper">{title}</h1>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-paper-40 sm:inline">
            {pathname.replace(/^\/admin\/?/, '') || 'dashboard'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Notifications"
          className="relative rounded-[4px] p-2.5 text-paper-70 hover:bg-paper-12 hover:text-paper"
        >
          <Bell size={16} />
          {/* placeholder indicator */}
          <span
            aria-hidden
            className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-vermilion"
          />
        </button>
        <div className="flex h-9 items-center gap-2.5 rounded-[4px] border border-line px-2.5">
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-full bg-kraft font-mono text-[10px] font-medium text-ink"
          >
            CH
          </span>
          <span className="hidden font-mono text-xs text-paper-60 sm:inline">
            admin@cra7tyhub.ng
          </span>
        </div>
      </div>
    </header>
  );
}
