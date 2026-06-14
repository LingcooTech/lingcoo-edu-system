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
  variant = 'segmented',
  className,
}: {
  tabs: readonly AdminTabItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  variant?: 'segmented' | 'underline';
  className?: string;
}) {
  if (variant === 'underline') {
    return (
      <div className={cn('admin-tabs-underline', className)} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeKey === tab.key}
            className={cn('admin-tab-underline', activeKey === tab.key && 'admin-tab-active')}
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
    <div
      className={cn('admin-tabs-segmented', className)}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeKey === tab.key}
          className={cn('admin-tab-segment', activeKey === tab.key && 'admin-tab-active')}
          onClick={() => onChange(tab.key)}
        >
          <span className="flex min-w-0 items-center justify-center gap-1.5">
            {tab.icon ? <span className="admin-tab-icon">{tab.icon}</span> : null}
            <span className="truncate">{tab.label}</span>
            {tab.badge ? <span className="admin-tab-badge">{tab.badge}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}
