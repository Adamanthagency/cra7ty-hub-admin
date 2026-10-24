'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/admin/sidebar';
import { Topbar } from '@/components/admin/topbar';
import { ContentProvider } from '@/components/admin/workbench/content-provider';
import { DraftBar } from '@/components/admin/workbench/draft-bar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // The visual editor renders DraftBar inside its own toolbar so the
  // frame fills the remaining height — skip the shell's copy there.
  const isVisualRoute = /^\/admin\/pages\/[^/]+\/visual$/.test(pathname);

  // Login runs outside the shell.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  return (
    <ContentProvider>
      <div className="min-h-screen bg-bg">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div
          className={
            collapsed ? 'md:pl-14' : 'md:pl-[220px]'
          }
        >
          <Topbar onOpenMobile={() => setMobileOpen(true)} />
          {!isVisualRoute && <DraftBar />}
          <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </ContentProvider>
  );
}
