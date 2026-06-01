import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import type { AuthAccount } from '@/api/client';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const COLLAPSE_KEY = 'fd:edu-admin:sidebar-collapsed';

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(COLLAPSE_KEY) === '1';
}

export function Shell({ account }: { account: AuthAccount }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div
      className={cn(
        'grid min-h-screen w-full grid-cols-1',
        collapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[240px_minmax(0,1fr)]',
      )}
    >
      <div className="hidden lg:block">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((current) => !current)}
          account={account}
        />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="关闭侧边栏"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[240px]">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              account={account}
              showCollapseToggle={false}
            />
          </div>
        </div>
      )}

      <div className="bg-background flex min-h-screen min-w-0 flex-col overflow-hidden">
        <Topbar account={account} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
