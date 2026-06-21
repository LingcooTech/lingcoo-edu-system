import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, Shield, UserRound, X } from 'lucide-react';

import { loadHome, type HomePayload } from '@/api/client';
import { useSession } from '@/features/session';
import { updateDocumentFavicon } from '@/lib/favicon';

const defaultNavItems = [
  { to: '/', label: '首页', end: true },
  { to: '/courses', label: '课程', end: false },
  { to: '/trials', label: '试听', end: false },
  { to: '/teachers', label: '老师', end: false },
  { to: '/stories', label: '成长故事', end: false },
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
      to: item.path === '/students' ? '/stories' : item.path,
      label: item.label,
      end: item.path === '/',
    }));
}

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function Brand({
  organization,
  loading = false,
}: {
  organization?: HomePayload['organization'];
  loading?: boolean;
}) {
  const logoUrl =
    organization?.branding.fullLogoUrl ||
    organization?.branding.logoUrl ||
    organization?.branding.squareLogoUrl;
  const brandName = organization?.brandName ?? '成长教室';

  if (loading) {
    return (
      <Link to="/" className="app-brand" aria-label="首页">
        <span className="skeleton block h-7 w-36 rounded-xl" />
      </Link>
    );
  }

  return (
    <Link to="/" className="app-brand">
      {logoUrl ? (
        <img src={logoUrl} alt={brandName} className="site-brand-logo" />
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
  const [homeLoaded, setHomeLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const { account, openAuth, logout } = useSession();

  useEffect(() => {
    loadHome()
      .then(setHome)
      .catch(() => undefined)
      .finally(() => setHomeLoaded(true));
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
  const navItems = homeLoaded ? navItemsFor(organization) : [];
  const primaryCtaText = organization?.publicProfile.ctaText || '预约试听';
  const primaryCtaLink = organization?.publicProfile.ctaLink || '/register';
  const accountMenuPath = account?.role === 'teacher' ? '/teacher' : '/account';
  const accountMenuLabel = account?.role === 'teacher' ? '老师工作台' : '个人中心';

  useEffect(() => {
    if (homeLoaded) {
      updateDocumentFavicon(organization?.branding.faviconUrl);
    }
  }, [homeLoaded, organization?.branding.faviconUrl]);

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

          <Brand organization={organization} loading={!homeLoaded} />

          <nav className="site-nav" aria-label="主导航">
            {!homeLoaded ? (
              <div className="flex gap-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <span key={index} className="skeleton block h-8 w-16 rounded-full" />
                ))}
              </div>
            ) : (
              navItems.map((item) => <HeaderNavItem key={`${item.to}-${item.label}`} item={item} />)
            )}
          </nav>

          <div className="site-actions">
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
                className="site-login-trigger"
                onClick={() => openAuth('login')}
                aria-label="登录或注册"
              >
                <UserRound className="h-4 w-4" />
                <span>登录 / 注册</span>
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
          <aside
            className="site-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
          >
            <div className="site-drawer-head">
              <Brand organization={organization} loading={!homeLoaded} />
              <button
                type="button"
                className="site-icon-btn"
                aria-label="关闭菜单"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="site-drawer-body">
              <nav className="site-drawer-nav" aria-label="移动端导航">
                <span className="site-drawer-group-label">浏览</span>
                {navItems.map((item) => (
                  <DrawerNavItem key={`${item.to}-${item.label}`} item={item} />
                ))}
              </nav>
            </div>
            <div className="site-drawer-footer">
              <Link to={primaryCtaLink} className="pwbtn pwbtn-primary w-full">
                {primaryCtaText}
              </Link>
              {account ? (
                <div className="grid gap-2">
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
                  className="pwbtn pwbtn-outline w-full"
                  onClick={() => {
                    setDrawerOpen(false);
                    openAuth('login');
                  }}
                >
                  登录 / 注册
                </button>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      <main className="site-main">{children}</main>

      <footer className="site-footer">
        <div className="site-footer-simple">
          <div className="site-footer-brandline">
            <Brand organization={organization} loading={!homeLoaded} />
            {homeLoaded ? (
              <p className="site-footer-note">
                {organization?.publicProfile.bannerTitle ?? '在社区里，给孩子一个稳定成长的课堂'}
              </p>
            ) : (
              <div className="skeleton mt-3 h-4 w-72 max-w-full" />
            )}
          </div>
          <div className="site-footer-org">
            {homeLoaded ? (
              <>
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
              </>
            ) : (
              <div className="ml-auto max-w-full space-y-2 lg:w-80">
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-2/3 lg:ml-auto" />
              </div>
            )}
          </div>
        </div>
        <div className="site-footer-bottom">
          {homeLoaded ? (
            <>
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
            </>
          ) : (
            <span className="skeleton inline-block h-3.5 w-44" />
          )}
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
