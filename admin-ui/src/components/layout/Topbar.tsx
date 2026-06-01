import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Menu, Search, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import type { AuthAccount } from '@/api/client';
import { adminSections, pageMeta } from '@/lib/foundation';
import { cn } from '@/lib/utils';

function detectShortcutLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  const platform = navigator.platform?.toLowerCase?.() ?? '';
  const userAgent = navigator.userAgent?.toLowerCase?.() ?? '';
  return platform.includes('mac') || userAgent.includes('mac') ? '⌘K' : 'Ctrl K';
}

export function Topbar({
  onMenuClick,
}: {
  account: AuthAccount;
  onMenuClick?: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [shortcutLabel] = useState(detectShortcutLabel);
  const location = useLocation();
  const pages = useMemo(
    () =>
      adminSections.flatMap((section) => {
        const sectionPage = {
          key: section.key,
          group: section.label,
          isSection: true,
          label: section.label,
          path: section.path,
        };
        return [
          sectionPage,
          ...section.items.map((item) => ({
            key: item.key,
            group: section.label,
            isSection: false,
            label: item.label,
            path: item.path,
          })),
        ];
      }),
    [],
  );
  const currentPage = useMemo(() => {
    const matched =
      pages
        .filter(
          (page) => location.pathname === page.path || location.pathname.startsWith(`${page.path}/`),
        )
        .sort(
          (left, right) =>
            right.path.length - left.path.length ||
            Number(left.isSection) - Number(right.isSection),
        )[0] ?? pages[0];
    const meta = pageMeta[matched.key as keyof typeof pageMeta];
    return {
      group: matched.group,
      title: meta?.title ?? matched.label,
    };
  }, [location.pathname, pages]);
  const filteredPages = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return pages;
    return pages.filter(
      (page) =>
        page.label.toLowerCase().includes(normalizedKeyword) ||
        page.group.toLowerCase().includes(normalizedKeyword) ||
        page.path.toLowerCase().includes(normalizedKeyword),
    );
  }, [keyword, pages]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = target
        ? ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
        : false;
      if (
        (event.key === '/' && !isTypingTarget) ||
        (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey))
      ) {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setSearchOpen(false);
    setKeyword('');
  }, [location.pathname]);

  return (
    <>
      <header className="border-border/70 bg-card/85 sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4 backdrop-blur-md">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {onMenuClick ? (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="打开侧边栏"
              className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
          ) : null}
          <nav aria-label="面包屑" className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <span className="text-muted-foreground/80 hidden sm:inline">{currentPage.group}</span>
            <ChevronRight className="text-muted-foreground/40 hidden h-3.5 w-3.5 sm:inline" />
            <span className="text-foreground truncate font-semibold">{currentPage.title}</span>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="text-muted-foreground border-border/70 bg-background hover:bg-muted/70 hover:text-foreground inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-[12px] shadow-[0_1px_2px_rgba(15,23,42,0.035)] transition-colors"
            title={`搜索 / 跳转（/ 或 ${shortcutLabel}）`}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="text-muted-foreground/80 hidden md:inline">搜索...</span>
            <kbd className="border-border/70 bg-card text-muted-foreground/80 ml-1 hidden h-4 items-center rounded border px-1 font-mono text-[10px] md:inline-flex">
              {shortcutLabel}
            </kbd>
          </button>
        </div>
      </header>

      {searchOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="关闭搜索"
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]"
            onClick={() => setSearchOpen(false)}
          />
          <div className="bg-card absolute left-1/2 top-20 w-[min(92vw,560px)] -translate-x-1/2 overflow-hidden rounded-xl border shadow-xl">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Search className="text-muted-foreground h-4 w-4" />
              <input
                autoFocus
                className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="搜索页面或输入路径关键词"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
              <button
                type="button"
                className="text-muted-foreground hover:bg-muted rounded-md p-1"
                onClick={() => setSearchOpen(false)}
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[360px] overflow-auto p-2">
              {filteredPages.length ? (
                filteredPages.map((page) => (
                  <Link
                    key={`${page.group}-${page.path}`}
                    to={page.path}
                    className={cn(
                      'flex items-center justify-between rounded-lg px-3 py-2 text-sm no-underline transition-colors',
                      location.pathname === page.path
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-foreground',
                    )}
                  >
                    <span className="font-medium">{page.label}</span>
                    <span
                      className={cn(
                        'text-xs',
                        location.pathname === page.path
                          ? 'text-primary-foreground/80'
                          : 'text-muted-foreground',
                      )}
                    >
                      {page.group}
                    </span>
                  </Link>
                ))
              ) : (
                <div className="text-muted-foreground px-3 py-8 text-center text-sm">
                  未找到匹配页面
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
