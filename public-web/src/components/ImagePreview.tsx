import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect } from 'react';

export interface ImagePreviewState {
  urls: string[];
  index: number;
}

export function ImagePreview({
  viewer,
  onClose,
  onChange,
}: {
  viewer: ImagePreviewState | null;
  onClose: () => void;
  onChange: (index: number) => void;
}) {
  useEffect(() => {
    if (!viewer) return;
    const currentViewer = viewer;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') {
        onChange((currentViewer.index - 1 + currentViewer.urls.length) % currentViewer.urls.length);
      }
      if (event.key === 'ArrowRight') {
        onChange((currentViewer.index + 1) % currentViewer.urls.length);
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onChange, onClose, viewer]);

  if (!viewer || viewer.urls.length === 0) return null;

  const current = Math.min(Math.max(viewer.index, 0), viewer.urls.length - 1);
  const multiple = viewer.urls.length > 1;
  const showPrev = () => onChange((current - 1 + viewer.urls.length) % viewer.urls.length);
  const showNext = () => onChange((current + 1) % viewer.urls.length);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      onClick={onClose}
      className="bg-ink/90 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭预览"
        className="absolute top-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {multiple ? (
        <>
          <button
            type="button"
            aria-label="上一张"
            onClick={(event) => {
              event.stopPropagation();
              showPrev();
            }}
            className="absolute left-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-6"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="下一张"
            onClick={(event) => {
              event.stopPropagation();
              showNext();
            }}
            className="absolute right-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-6"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}

      <img
        src={viewer.urls[current]}
        alt={`预览图 ${current + 1}`}
        onClick={(event) => event.stopPropagation()}
        decoding="async"
        className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
      />

      {multiple ? (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
          {current + 1} / {viewer.urls.length}
        </div>
      ) : null}
    </div>
  );
}
