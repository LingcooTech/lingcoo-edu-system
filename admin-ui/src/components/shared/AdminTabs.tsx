import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface AdminTabItem<T extends string = string> {
  key: T;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export function AdminTabs<T extends string>({
  tabs,
  activeKey,
  onChange,
  variant = 'page',
  className,
}: {
  tabs: readonly AdminTabItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  variant?: 'page' | 'table';
  className?: string;
}) {
  if (variant === 'table') {
    return (
      <div className={cn('admin-tabs-table', className)} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeKey === tab.key}
            className={cn('admin-tab-table', activeKey === tab.key && 'admin-tab-active')}
            onClick={() => onChange(tab.key)}
          >
            {tab.icon ? <span className="admin-tab-icon">{tab.icon}</span> : null}
            <span>{tab.label}</span>
            {tab.badge ? <span className="admin-tab-badge">{tab.badge}</span> : null}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('admin-tabs-page', className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeKey === tab.key}
          className={cn('admin-tab-page', activeKey === tab.key && 'admin-tab-active')}
          onClick={() => onChange(tab.key)}
        >
          {tab.icon ? <span className="admin-tab-icon">{tab.icon}</span> : null}
          <span className="truncate">{tab.label}</span>
          {tab.badge ? <span className="admin-tab-badge">{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
