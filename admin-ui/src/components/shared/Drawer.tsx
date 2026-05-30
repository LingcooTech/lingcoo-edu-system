import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Right-side slide-over used for resource create/edit forms across the admin.
 * Controlled via `open`; closes on overlay click or Escape. Provide form fields
 * as children and the action buttons as `footer`.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label={title}>
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
          </div>
          <button
            type="button"
            className="btn btn-ghost -mr-2 px-2"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="bg-muted/30 flex justify-end gap-2 border-t px-5 py-3">{footer}</footer>
        )}
      </aside>
    </>
  );
}
