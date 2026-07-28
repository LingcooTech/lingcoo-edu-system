import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, LogOut, PanelLeft } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { logout, type AuthAccount } from '@/api/client';
import type { OrganizationSettings } from '@/api/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { adminSections } from '@/lib/foundation';
import { cn, getInitials } from '@/lib/utils';

function sectionPrefix(path: string) {
  const [, prefix] = path.split('/');
  return prefix ? `/${prefix}` : path;
}

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  teacher: '老师',
  parent: '家长',
};

export function Sidebar({
  collapsed,
  onToggle,
  account,
  organization,
  showCollapseToggle = true,
}: {
  collapsed: boolean;
  onToggle: () => void;
  account: AuthAccount;
  organization?: OrganizationSettings | null;
  showCollapseToggle?: boolean;
}) {
  const location = useLocation();
  const brandName = organization?.brandName || organization?.name || 'lingcoo-edu-system';
  const fullLogoUrl = organization?.branding.fullLogoUrl || organization?.branding.logoUrl || '';
  const squareLogoUrl =
    organization?.branding.squareLogoUrl || organization?.branding.logoUrl || fullLogoUrl;
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
    window.location.href = '/admin/login';
  }

  return (
    <aside
      className={cn(
        'bg-muted/35 sticky top-0 flex h-screen flex-col overflow-hidden border-r transition-all duration-200',
        collapsed ? 'w-[72px]' : 'w-[240px]',
      )}
    >
      <div
        className={cn(
          'group/brand relative shrink-0 px-3 pt-4 pb-3',
          collapsed ? 'space-y-0' : 'flex items-center gap-2.5',
        )}
      >
        <Link
          to="/"
          className={cn(
            'flex items-center gap-2.5 no-underline',
            collapsed ? 'justify-center' : 'min-w-0 flex-1',
          )}
          aria-label="返回经营看板"
        >
          {collapsed ? (
            <BrandIcon logoUrl={squareLogoUrl} brandName={brandName} />
          ) : fullLogoUrl ? (
            <img src={fullLogoUrl} alt={brandName} className="h-6 max-w-[120px] object-contain" />
          ) : (
            <>
              <BrandIcon logoUrl={squareLogoUrl} brandName={brandName} />
              <div className="min-w-0">
                <p className="text-foreground truncate text-[13px] leading-tight font-semibold tracking-tight">
                  {brandName}
                </p>
                <p className="text-muted-foreground/80 mt-0.5 text-[10px]">Education Console</p>
              </div>
            </>
          )}
        </Link>
        {showCollapseToggle ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  'text-muted-foreground hover:bg-muted hover:text-foreground rounded-md',
                  collapsed
                    ? 'bg-background absolute inset-x-3 top-4 z-10 h-8 w-auto opacity-0 shadow-sm group-hover/brand:opacity-100'
                    : 'ml-auto h-7 w-7 shrink-0',
                )}
                onClick={onToggle}
                aria-label={collapsed ? '打开边栏' : '收起边栏'}
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {collapsed ? '打开边栏' : '收起边栏'}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <ScrollArea className={cn('flex-1 px-2', collapsed && 'pt-2')}>
        {adminSections.map((section) => {
          const isExpanded = expanded[section.key] ?? false;
          const hasChildren = section.items.length > 0;
          const isActiveSection = activeSection.key === section.key;
          const sectionLink = (
            <NavLink
              to={section.path}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center rounded-md no-underline transition-colors',
                  collapsed
                    ? 'mb-0 h-10 justify-center px-1'
                    : 'mb-0.5 h-9 gap-2.5 px-2.5 text-[13px] font-medium',
                  isActive || isActiveSection
                    ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.05)]'
                    : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
                )
              }
              onClick={() => {
                if (hasChildren && !collapsed) {
                  setExpanded((current) => ({ ...current, [section.key]: !isExpanded }));
                }
              }}
            >
              {isActiveSection && !collapsed ? (
                <span className="bg-primary absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r" />
              ) : null}
              <section.icon
                className={cn(
                  'shrink-0',
                  collapsed ? 'h-[18px] w-[18px]' : 'h-4 w-4',
                  isActiveSection ? 'text-primary' : 'text-muted-foreground/70',
                )}
                strokeWidth={1.75}
              />
              {!collapsed && <span className="flex-1 truncate">{section.label}</span>}
              {!collapsed && hasChildren ? (
                <ChevronRight
                  className={cn(
                    'text-muted-foreground/60 h-3.5 w-3.5 shrink-0 transition-transform',
                    isExpanded ? 'rotate-90' : 'rotate-0',
                  )}
                />
              ) : null}
            </NavLink>
          );
          return (
            <div key={section.key} className={cn(collapsed ? 'mb-2 space-y-2' : 'mb-3')}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{sectionLink}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {section.label}
                  </TooltipContent>
                </Tooltip>
              ) : (
                sectionLink
              )}
              {hasChildren && !collapsed && isExpanded && (
                <div className="border-border/60 mt-0.5 ml-6 space-y-0.5 border-l pl-3">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.key}
                      to={item.path}
                      className={({ isActive }) =>
                        cn(
                          'flex h-8 items-center rounded-md px-2 text-[12.5px] font-medium no-underline transition-colors',
                          isActive
                            ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.05)]'
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
      </ScrollArea>

      <div className="border-border/70 shrink-0 border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'hover:bg-card/80 w-full rounded-md text-left transition-colors',
                collapsed
                  ? 'flex items-center justify-center p-1.5'
                  : 'flex items-center gap-2.5 px-2 py-1.5',
              )}
              title={collapsed ? account.displayName : undefined}
            >
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-[10px]">
                  {getInitials(account.displayName)}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13px] font-medium">
                      {account.displayName}
                    </span>
                    <span className="text-muted-foreground block truncate text-[10px]">
                      {account.email ?? ROLE_LABEL[account.role] ?? account.role}
                    </span>
                  </span>
                  <ChevronRight className="text-muted-foreground/60 h-3.5 w-3.5 shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={collapsed ? 'start' : 'end'}
            side="top"
            className="bg-card w-[260px] rounded-lg border p-1 shadow-lg"
          >
            <DropdownMenuLabel className="px-2 pt-2 pb-2">
              <div className="flex items-center gap-2.5">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="text-xs">
                    {getInitials(account.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-tight font-semibold">
                    {account.displayName}
                  </p>
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    {account.email ?? account.phone ?? ROLE_LABEL[account.role] ?? account.role}
                  </p>
                  <p className="text-muted-foreground/70 mt-0.5 truncate text-[10px] font-medium tracking-wider uppercase">
                    {ROLE_LABEL[account.role] ?? account.role}
                  </p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="rounded-md px-2.5 py-2 text-[13px] text-rose-600 focus:bg-rose-50 focus:text-rose-600"
              onSelect={(event) => {
                event.preventDefault();
                void handleLogout();
              }}
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

function BrandIcon({ logoUrl, brandName }: { logoUrl?: string; brandName: string }) {
  if (logoUrl) {
    return (
      <span className="bg-card flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
        <img src={logoUrl} alt={brandName} className="h-full w-full object-contain" />
      </span>
    );
  }

  return (
    <span className="from-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br to-blue-500 text-[10px] font-semibold text-white">
      {getInitials(brandName)}
    </span>
  );
}
