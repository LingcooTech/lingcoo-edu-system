import { Plus, type LucideIcon } from 'lucide-react';

import { AdminTabs } from './AdminTabs';

export interface ResourceToolbarAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary';
}

export function ResourceToolbar<T extends string>({
  tabs,
  activeKey,
  onTabChange,
  action,
  secondaryActions = [],
}: {
  tabs: readonly { key: T; label: string }[];
  activeKey: T;
  onTabChange: (key: T) => void;
  action?: ResourceToolbarAction | null;
  secondaryActions?: ResourceToolbarAction[];
}) {
  return (
    <div className="resource-toolbar">
      <AdminTabs
        tabs={tabs}
        activeKey={activeKey}
        onChange={onTabChange}
        variant="table"
        className="sm:w-auto"
      />

      {action || secondaryActions.length > 0 ? (
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {secondaryActions.map((secondaryAction) => {
            const Icon = secondaryAction.icon;
            return (
              <button
                key={secondaryAction.label}
                type="button"
                className={`btn h-10 px-4 ${
                  secondaryAction.variant === 'primary' ? 'btn-primary' : 'btn-secondary'
                }`}
                onClick={secondaryAction.onClick}
                disabled={secondaryAction.disabled}
              >
                {Icon ? <Icon className="h-4 w-4" /> : null}
                {secondaryAction.label}
              </button>
            );
          })}
          {action ? (
            <button
              type="button"
              className={`btn h-10 px-4 ${
                action.variant === 'secondary' ? 'btn-secondary' : 'btn-primary'
              }`}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.icon ? <action.icon className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
