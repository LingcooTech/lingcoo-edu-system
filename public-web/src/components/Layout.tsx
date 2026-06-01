import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, Phone, UserRound, X } from 'lucide-react';

import { loadHome, type HomePayload } from '@/api/client';

const navItems = [
  { to: '/', label: '首页', end: true },
  { to: '/courses', label: '课程', end: false },
  { to: '/trials', label: '试听', end: false },
  { to: '/teachers', label: '老师', end: false },
  { to: '/students', label: '学员', end: false },
  { to: '/about', label: '关于', end: false },
];

function Brand({ organization }: { organization?: HomePayload['organization'] }) {
  const logoUrl =
    organization?.branding.fullLogoUrl ||
    organization?.branding.logoUrl ||
    organization?.branding.squareLogoUrl;
  const brandName = organization?.brandName ?? '成长教室';

  return (
    <Link to="/" className="app-brand">
      {logoUrl ? (
        <img src={logoUrl} alt={brandName} className="h-8 max-w-36 object-contain" />
      ) : (
        <span className="app-brand-mark">FD</span>
      )}
      <span className="app-brand-name">{brandName}</span>
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    loadHome()
      .then(setHome)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const organization = home?.organization;

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div className="site-app">
      <header className={scrolled ? 'site-header is-scrolled' : 'site-header'}>
        <div className="site-header-bar">
          <button
            type="button"
            className="site-icon-btn lg:hidden"
            aria-label="打开菜单"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <Brand organization={organization} />

          <nav className="site-nav" aria-label="主导航">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? 'site-nav-link is-active' : 'site-nav-link'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="site-actions">
            {organization?.phone ? (
              <a className="site-phone" href={`tel:${organization.phone}`}>
                <Phone className="h-4 w-4" />
                <span>{organization.phone}</span>
              </a>
            ) : null}
            <Link to="/account" className="site-icon-btn" aria-label="家长中心">
              <UserRound className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      {drawerOpen ? (
        <div className="site-drawer">
          <button
            type="button"
            aria-label="关闭菜单"
            className="site-drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="site-drawer-panel">
            <div className="flex items-center justify-between">
              <Brand organization={organization} />
              <button
                type="button"
                className="site-icon-btn"
                aria-label="关闭菜单"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="mt-8 grid gap-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    isActive ? 'site-drawer-link is-active' : 'site-drawer-link'
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <Link to="/register" className="pwbtn pwbtn-primary mt-8 w-full">
              预约试听
            </Link>
          </aside>
        </div>
      ) : null}

      <main className="site-main">{children}</main>

      <footer className="site-footer">
        <div className="site-footer-grid">
          <div>
            <Brand organization={organization} />
            <p className="text-ink-soft mt-4 text-sm leading-6">
              {organization?.publicProfile.bannerSubtitle ??
                '扫码或填表预约试听，老师会尽快联系确认上课时间。'}
            </p>
          </div>
          <div>
            <h3 className="site-footer-heading">导航</h3>
            <div className="site-footer-list">
              {navItems.map((item) => (
                <Link key={item.to} to={item.to}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h3 className="site-footer-heading">联系</h3>
            <div className="site-footer-list">
              <span>{organization?.address ?? '请在后台配置校区地址'}</span>
              <span>{organization?.phone ?? '请在后台配置联系电话'}</span>
              <span>{organization?.publicProfile.businessHours}</span>
            </div>
          </div>
        </div>
        <div className="site-footer-bottom">© {new Date().getFullYear()} {organization?.brandName ?? '成长教室'}</div>
      </footer>
    </div>
  );
}
