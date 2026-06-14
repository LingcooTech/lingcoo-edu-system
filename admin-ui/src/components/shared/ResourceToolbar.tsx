import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface ResourceToolbarAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function ResourceToolbar<T extends string>({
  tabs,
  activeKey,
  onTabChange,
  action,
}: {
  tabs: readonly { key: T; label: string }[];
  activeKey: T;
  onTabChange: (key: T) => void;
  action?: ResourceToolbarAction | null;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="bg-card inline-grid w-full grid-cols-2 gap-1 rounded-lg border p-1 shadow-sm sm:w-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={cn(
              'h-10 min-w-24 rounded-md px-4 text-sm font-semibold transition-colors',
              activeKey === tab.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
            )}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {action ? (
        <button
          type="button"
          className="btn btn-primary h-10 shrink-0 shadow-sm"
          onClick={action.onClick}
          disabled={action.disabled}
        >
          <Plus className="h-4 w-4" />
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
