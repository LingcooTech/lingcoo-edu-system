import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, Phone, Shield, UserRound, X } from 'lucide-react';

import { loadHome, type HomePayload } from '@/api/client';
import { useSession } from '@/features/session';

const defaultNavItems = [
  { to: '/', label: '首页', end: true },
  { to: '/courses', label: '课程', end: false },
  { to: '/trials', label: '试听', end: false },
  { to: '/teachers', label: '老师', end: false },
  { to: '/students', label: '学员', end: false },
  { to: '/about', label: '关于', end: false },
];

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  teacher: '老师',
  parent: '家长',
};

function navItemsFor(organization?: HomePayload['organization']) {
  const configured = organization?.publicSite?.navigation;
  if (!configured) {
    return defaultNavItems;
  }

  return configured
    .filter((item) => item.visible)
    .map((item) => ({
      to: item.path,
      label: item.label,
      end: item.path === '/',
    }));
}

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

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
        <>
          <span className="app-brand-mark">FD</span>
          <span className="app-brand-name">{brandName}</span>
        </>
      )}
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const { account, openAuth, logout } = useSession();

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

  // Close the account dropdown when clicking outside it.
  useEffect(() => {
    if (!accountOpen) {
      return;
    }
    function onClick(event: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [accountOpen]);

  const organization = home?.organization;
  const navItems = navItemsFor(organization);
  const accountMenuPath = account?.role === 'teacher' ? '/teacher' : '/account';
  const accountMenuLabel = account?.role === 'teacher' ? '老师工作台' : '个人中心';

  useEffect(() => {
    setDrawerOpen(false);
    setAccountOpen(false);
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
              <HeaderNavItem key={`${item.to}-${item.label}`} item={item} />
            ))}
          </nav>

          <div className="site-actions">
            {organization?.phone ? (
              <a className="site-phone" href={`tel:${organization.phone}`}>
                <Phone className="h-4 w-4" />
                <span>{organization.phone}</span>
              </a>
            ) : null}
            {account ? (
              <div className="relative" ref={accountRef}>
                <button
                  type="button"
                  className="site-account-trigger"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  onClick={() => setAccountOpen((open) => !open)}
                >
                  <span className="site-avatar">
                    {(account.displayName || '账').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden max-w-24 truncate sm:inline">{account.displayName}</span>
                  <ChevronDown className="text-muted h-4 w-4" />
                </button>
                {accountOpen ? (
                  <div className="site-account-menu" role="menu">
                    <div className="site-account-menu-head">
                      <div className="text-ink font-semibold">{account.displayName}</div>
                      <div className="text-muted text-xs">{ROLE_LABEL[account.role] ?? '账号'}</div>
                    </div>
                    <Link to={accountMenuPath} role="menuitem" className="site-account-menu-item">
                      <UserRound className="h-4 w-4" />
                      {accountMenuLabel}
                    </Link>
                    {account.role === 'admin' ? (
                      <a href="/admin" role="menuitem" className="site-account-menu-item">
                        <Shield className="h-4 w-4" />
                        管理后台
                      </a>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      className="site-account-menu-item w-full text-left"
                      onClick={() => {
                        setAccountOpen(false);
                        void logout();
                      }}
                    >
                      <LogOut className="h-4 w-4" />
                      退出登录
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                className="pwbtn pwbtn-primary px-4 py-2"
                onClick={() => openAuth('login')}
              >
                登录 / 注册
              </button>
            )}
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
                <DrawerNavItem key={`${item.to}-${item.label}`} item={item} />
              ))}
            </nav>
            <Link to="/register" className="pwbtn pwbtn-primary mt-8 w-full">
              预约试听
            </Link>
            {account ? (
              <div className="mt-3 grid gap-2">
                <Link to={accountMenuPath} className="pwbtn pwbtn-outline w-full">
                  {accountMenuLabel}
                </Link>
                <button
                  type="button"
                  className="pwbtn pwbtn-outline w-full"
                  onClick={() => void logout()}
                >
                  退出登录
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="pwbtn pwbtn-outline mt-3 w-full"
                onClick={() => {
                  setDrawerOpen(false);
                  openAuth('login');
                }}
              >
                登录 / 注册
              </button>
            )}
          </aside>
        </div>
      ) : null}

      <main className="site-main">{children}</main>

      <footer className="site-footer">
        <div className="site-footer-simple">
          <div className="site-footer-brandline">
            <Brand organization={organization} />
            <p className="site-footer-note">
              {organization?.publicProfile.bannerSubtitle ??
                '扫码或填表预约试听，老师会尽快联系确认上课时间。'}
            </p>
          </div>
          <div className="site-footer-org">
            <div className="site-footer-org-name">
              {organization?.address ?? organization?.brandName ?? '成长教室'}
            </div>
            <div className="site-footer-org-meta">
              {organization?.phone ? (
                <a href={`tel:${organization.phone}`}>{organization.phone}</a>
              ) : null}
              {organization?.publicProfile.businessHours ? (
                <span>{organization.publicProfile.businessHours}</span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="site-footer-bottom">
          <span>
            © {new Date().getFullYear()} {organization?.brandName ?? '成长教室'}
          </span>
          {organization?.publicSite?.icpNumber ? (
            organization.publicSite.icpUrl ? (
              <a
                className="site-footer-icp"
                href={organization.publicSite.icpUrl}
                target="_blank"
                rel="noreferrer"
              >
                {organization.publicSite.icpNumber}
              </a>
            ) : (
              <span className="site-footer-icp">{organization.publicSite.icpNumber}</span>
            )
          ) : null}
        </div>
      </footer>
    </div>
  );
}

function HeaderNavItem({
  item,
}: {
  item: {
    to: string;
    label: string;
    end: boolean;
  };
}) {
  if (isExternalUrl(item.to)) {
    return (
      <a href={item.to} className="site-nav-link" target="_blank" rel="noreferrer">
        {item.label}
      </a>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => (isActive ? 'site-nav-link is-active' : 'site-nav-link')}
    >
      {item.label}
    </NavLink>
  );
}

function DrawerNavItem({
  item,
}: {
  item: {
    to: string;
    label: string;
    end: boolean;
  };
}) {
  if (isExternalUrl(item.to)) {
    return (
      <a href={item.to} className="site-drawer-link" target="_blank" rel="noreferrer">
        {item.label}
      </a>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => (isActive ? 'site-drawer-link is-active' : 'site-drawer-link')}
    >
      {item.label}
    </NavLink>
  );
}
