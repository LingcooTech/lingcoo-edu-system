import type { ReactNode } from 'react';

import { pageMeta } from '@/lib/foundation';

export function PageFrame({
  section,
  actions,
  children,
}: {
  section: keyof typeof pageMeta;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const meta = pageMeta[section];

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <div className="eyebrow">{meta.eyebrow}</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{meta.title}</h1>
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
