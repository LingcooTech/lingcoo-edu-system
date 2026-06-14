import type { ReactNode } from 'react';

import { pageMeta } from '@/lib/foundation';
import { cn } from '@/lib/utils';

export function PageFrame({
  section,
  actions,
  children,
  className,
  headerClassName,
  contentClassName,
}: {
  section: keyof typeof pageMeta;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}) {
  const meta = pageMeta[section];

  return (
    <div className={cn('page-shell', className)}>
      <div className={cn('page-header', headerClassName)}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{meta.title}</h1>
        </div>
        {actions}
      </div>
      <div className={cn('page-content', contentClassName)}>{children}</div>
    </div>
  );
}
