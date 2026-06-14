import { Plus } from 'lucide-react';

import { AdminTabs } from './AdminTabs';

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
    <div className="resource-toolbar">
      <AdminTabs
        tabs={tabs}
        activeKey={activeKey}
        onChange={onTabChange}
        variant="table"
        className="sm:w-auto"
      />

      {action ? (
        <button
          type="button"
          className="btn btn-primary h-10 shrink-0 px-4"
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
