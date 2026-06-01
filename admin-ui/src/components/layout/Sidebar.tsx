import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

import { logout, type AuthAccount } from '@/api/client';
import { adminSections } from '@/lib/foundation';
import { cn, getInitials } from '@/lib/utils';

function sectionPrefix(path: string) {
  const [, prefix] = path.split('/');
  return prefix ? `/${prefix}` : path;
}

export function Sidebar({
  collapsed,
  onToggle,
  account,
  showCollapseToggle = true,
}: {
  collapsed: boolean;
  onToggle: () => void;
  account: AuthAccount;
  showCollapseToggle?: boolean;
}) {
  const location = useLocation();
  const activeSection = useMemo(
    () =>
      adminSections.find((section) => location.pathname.startsWith(sectionPrefix(section.path))) ??
      adminSections[0],
    [location.pathname],
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      adminSections.map((section) => [section.key, section.key === activeSection.key]),
    ),
  );

  useEffect(() => {
    if (!collapsed) {
      setExpanded((current) => ({ ...current, [activeSection.key]: true }));
    }
  }, [activeSection.key, collapsed]);

  async function handleLogout() {
    await logout();
    window.location.href = '/login';
  }

  return (
    <aside
      className={cn(
        'bg-muted/35 sticky top-0 flex h-screen flex-col overflow-hidden border-r transition-all duration-200',
        collapsed ? 'w-[72px]' : 'w-[240px]',
      )}
    >
      <div className={cn('group/brand shrink-0 px-3 pb-3 pt-4', collapsed ? '' : 'flex gap-2.5')}>
        <NavLink
          to="/"
          className={cn('flex items-center gap-2.5 no-underline', collapsed ? 'justify-center' : 'min-w-0 flex-1')}
          aria-label="返回经营看板"
        >
          <div className="from-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br to-blue-500 text-[11px] font-semibold text-white">
            {getInitials('FD Edu')}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-tight">fd-edu-system</p>
              <p className="text-muted-foreground/80 mt-0.5 text-[10px]">Education Console</p>
            </div>
          )}
        </NavLink>
        {showCollapseToggle && (
          <button
            type="button"
            className={cn(
              'text-muted-foreground hover:bg-muted hover:text-foreground rounded-md',
              collapsed
                ? 'absolute inset-x-3 top-4 z-10 h-8 opacity-0 transition-opacity group-hover/brand:opacity-100'
                : 'ml-auto h-7 w-7 shrink-0',
            )}
            onClick={onToggle}
            aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
          >
            {collapsed ? <ChevronsRight className="mx-auto h-3.5 w-3.5" /> : <ChevronsLeft className="mx-auto h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-2 overflow-auto px-2 pb-3">
        {adminSections.map((section) => {
          const isExpanded = expanded[section.key] ?? false;
          const hasChildren = section.items.length > 0;
          const isActiveSection = activeSection.key === section.key;
          return (
            <div key={section.key}>
              <div className="flex items-center gap-1">
                <NavLink
                  to={section.path}
                  title={collapsed ? section.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'relative flex min-w-0 flex-1 items-center rounded-md no-underline transition-colors',
                      collapsed
                        ? 'h-10 justify-center px-1'
                        : 'h-9 gap-2.5 px-2.5 text-[13px] font-medium',
                      isActive || isActiveSection
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
                    )
                  }
                  onClick={() => {
                    if (hasChildren && !collapsed) {
                      setExpanded((current) => ({ ...current, [section.key]: true }));
                    }
                  }}
                >
                  {isActiveSection && !collapsed ? (
                    <span className="bg-primary absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r" />
                  ) : null}
                  <section.icon className={cn('shrink-0', collapsed ? 'h-[18px] w-[18px]' : 'h-4 w-4')} />
                  {!collapsed && <span className="flex-1 truncate">{section.label}</span>}
                </NavLink>
                {hasChildren && !collapsed && (
                  <button
                    type="button"
                    className="hover:bg-card text-muted-foreground rounded-md p-2"
                    aria-label={isExpanded ? '收起二级菜单' : '展开二级菜单'}
                    onClick={() =>
                      setExpanded((current) => ({ ...current, [section.key]: !isExpanded }))
                    }
                  >
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-180')} />
                  </button>
                )}
              </div>
              {hasChildren && !collapsed && isExpanded && (
                <div className="border-border/60 ml-6 mt-0.5 space-y-0.5 border-l pl-3">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.key}
                      to={item.path}
                      className={({ isActive }) =>
                        cn(
                          'flex h-8 items-center rounded-md px-2 text-[12.5px] font-medium no-underline transition-colors',
                          isActive
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t p-2">
        <button
          type="button"
          className={cn(
            'hover:bg-card/80 w-full rounded-md transition-colors',
            collapsed ? 'flex justify-center p-1.5' : 'flex items-center gap-2.5 px-2 py-1.5',
          )}
          onClick={handleLogout}
          title={collapsed ? '退出登录' : undefined}
        >
          <span className="bg-primary text-primary-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px]">
            {getInitials(account.displayName)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[13px] font-medium">{account.displayName}</span>
                <span className="text-muted-foreground block truncate text-[10px]">{account.role}</span>
              </span>
              <LogOut className="text-muted-foreground h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
