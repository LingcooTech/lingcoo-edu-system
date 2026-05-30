import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { MapPin, Phone, UserRound } from 'lucide-react';

import { loadHome, type HomePayload } from '@/api/client';

const navItems = [
  { to: '/', label: '首页', end: true },
  { to: '/courses', label: '课程', end: false },
  { to: '/trials', label: '试听', end: false },
  { to: '/about', label: '关于', end: false },
];

/**
 * Shared mobile-first chrome for the parent site: a slim sticky header with the
 * brand + section nav + 家长中心 entry, and a footer with the campus contact.
 * Organization info comes from the shared (cached) home payload.
 */
export function Layout({ children }: { children: ReactNode }) {
  const [home, setHome] = useState<HomePayload | null>(null);

  useEffect(() => {
    loadHome()
      .then(setHome)
      .catch(() => undefined);
  }, []);

  const organization = home?.organization;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-line bg-surface/90 sticky top-0 z-30 border-b backdrop-blur">
        <div className="container-narrow flex h-14 items-center justify-between">
          <Link to="/" className="text-ink truncate text-base font-semibold">
            {organization?.brandName ?? '成长教室'}
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? 'text-ink font-medium' : 'text-muted hover:text-ink'
                }
              >
                {item.label}
              </NavLink>
            ))}
            <Link
              to="/account"
              className="text-muted hover:text-ink inline-flex items-center gap-1"
              aria-label="家长中心"
            >
              <UserRound className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-line bg-surface mt-10 border-t">
        <div className="container-narrow text-ink-soft space-y-2 py-8 text-sm">
          <div className="text-ink font-semibold">{organization?.brandName ?? '成长教室'}</div>
          {organization?.address && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" />
              {organization.address}
            </div>
          )}
          {organization?.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0" />
              {organization.phone}
            </div>
          )}
          <p className="text-muted pt-2 text-xs">扫码或填表预约试听，老师会尽快联系确认上课时间。</p>
        </div>
      </footer>
    </div>
  );
}
