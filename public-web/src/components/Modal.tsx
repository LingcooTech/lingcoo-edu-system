import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Lightweight modal: a bottom sheet on mobile, a centered card on desktop.
 * Closes on backdrop click and Escape, and locks body scroll while open.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  panelClassName = '',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  panelClassName?: string;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const widthClass = panelClassName || 'max-w-md';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`bg-surface border-line relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl p-6 shadow-xl sm:rounded-3xl sm:border ${widthClass}`}
      >
        {title ? (
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-ink text-lg font-bold">{title}</h2>
            <button
              type="button"
              className="site-icon-btn h-9 w-9"
              aria-label="关闭"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {children}
        {footer ? <div className="mt-5">{footer}</div> : null}
      </div>
    </div>
  );
}
