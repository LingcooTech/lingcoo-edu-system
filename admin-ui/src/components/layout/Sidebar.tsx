import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

import { adminSections } from '@/lib/foundation';
import { cn } from '@/lib/utils';

function sectionPrefix(path: string) {
  const [, prefix] = path.split('/');
  return prefix ? `/${prefix}` : path;
}

export function Sidebar() {
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
    setExpanded((current) => ({ ...current, [activeSection.key]: true }));
  }, [activeSection.key]);

  return (
    <aside className="bg-card flex h-screen flex-col border-r">
      <div className="border-b px-5 py-4">
        <div className="text-sm font-semibold">fd-edu-stack</div>
        <div className="text-muted-foreground text-xs">社区教室经营后台</div>
      </div>
      <nav className="flex-1 space-y-2 overflow-auto p-3">
        {adminSections.map((section) => {
          const isExpanded = expanded[section.key] ?? false;
          const hasChildren = section.items.length > 0;
          return (
            <div key={section.key}>
              <div className="flex items-center gap-1">
                <NavLink
                  to={section.path}
                  className={({ isActive }) =>
                    cn(
                      'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors',
                      isActive || activeSection.key === section.key
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-muted',
                    )
                  }
                >
                  <section.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{section.label}</span>
                </NavLink>
                {hasChildren && (
                  <button
                    type="button"
                    className="hover:bg-muted text-muted-foreground rounded-md p-2"
                    aria-label={isExpanded ? '收起二级菜单' : '展开二级菜单'}
                    onClick={() =>
                      setExpanded((current) => ({
                        ...current,
                        [section.key]: !isExpanded,
                      }))
                    }
                  >
                    <ChevronDown
                      className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')}
                    />
                  </button>
                )}
              </div>
              {hasChildren && isExpanded && (
                <div className="mt-1 ml-4 space-y-1 border-l pl-3">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.key}
                      to={item.path}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
