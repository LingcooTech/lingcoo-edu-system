import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { fetchOrganization, type AuthAccount } from '@/api/client';
import type { OrganizationSettings } from '@/api/types';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ADMIN_ORGANIZATION_UPDATED_EVENT, applyAdminTheme } from '@/lib/admin-theme';
import { updateDocumentFavicon } from '@/lib/favicon';
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
  const [organization, setOrganization] = useState<OrganizationSettings | null>(null);
  const location = useLocation();
  const institutionAdminRouteAllowed =
    location.pathname === '/operations/lessons' ||
    location.pathname === '/operations/audit-logs';

  useEffect(() => {
    fetchOrganization()
      .then(setOrganization)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const handleOrganizationUpdated = (event: Event) => {
      const nextOrganization = (event as CustomEvent<OrganizationSettings>).detail;
      if (nextOrganization) setOrganization(nextOrganization);
    };
    window.addEventListener(ADMIN_ORGANIZATION_UPDATED_EVENT, handleOrganizationUpdated);
    return () =>
      window.removeEventListener(ADMIN_ORGANIZATION_UPDATED_EVENT, handleOrganizationUpdated);
  }, []);

  useEffect(() => {
    if (organization) {
      applyAdminTheme(organization);
      updateDocumentFavicon(organization.branding.faviconUrl);
      document.title = `${organization.brandName || organization.name}管理后台`;
    }
  }, [organization]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div
      className={cn(
        'grid h-screen w-full grid-cols-1 overflow-hidden',
        collapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[240px_minmax(0,1fr)]',
      )}
    >
      <div className="hidden lg:block">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((current) => !current)}
          account={account}
          organization={organization}
        />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[240px] border-r-0 p-0 sm:max-w-[240px] lg:hidden"
          aria-describedby={undefined}
        >
          <Sidebar
            collapsed={false}
            onToggle={() => setMobileOpen(false)}
            account={account}
            organization={organization}
            showCollapseToggle={false}
          />
        </SheetContent>
      </Sheet>

      <div className="bg-muted/25 flex h-screen min-h-0 flex-col overflow-hidden">
        <Topbar account={account} onMenuClick={() => setMobileOpen(true)} />
        <main className="min-h-0 flex-1 overflow-hidden">
          {account.role === 'institution_admin' && !institutionAdminRouteAllowed ? (
            <Navigate to="/operations/lessons" replace />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
