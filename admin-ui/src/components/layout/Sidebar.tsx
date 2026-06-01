import { NavLink } from 'react-router-dom';

import { adminSections } from '@/lib/foundation';
import { cn } from '@/lib/utils';

export function Sidebar() {
  return (
    <aside className="bg-card flex h-screen flex-col border-r">
      <div className="border-b px-5 py-4">
        <div className="text-sm font-semibold">fd-edu-stack</div>
        <div className="text-muted-foreground text-xs">社区教室经营后台</div>
      </div>
      <nav className="flex-1 space-y-5 overflow-auto p-3">
        {adminSections.map((group) => (
          <div key={group.key}>
            <div className="text-foreground flex items-center gap-2 px-2 pb-2 text-xs font-semibold">
              <group.icon className="h-4 w-4" />
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
