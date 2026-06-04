import type { Block } from './blocks';

/**
 * Renders Block[] for the admin live preview. Mirrors the public-web renderer's
 * structure (so "what you see is what parents get") but uses admin design tokens.
 * All text is rendered as escaped React children — no dangerouslySetInnerHTML.
 */
export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-5">
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} />
      ))}
    </div>
  );
}

function clean(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      if (!block.text.trim()) return null;
      return block.level === 3 ? (
        <h4 className="text-base font-semibold">{block.text}</h4>
      ) : (
        <h3 className="text-xl font-semibold tracking-tight">{block.text}</h3>
      );
    }
    case 'paragraph':
      if (!block.text.trim()) return null;
      return (
        <p className="text-muted-foreground text-sm leading-7 whitespace-pre-line">{block.text}</p>
      );
    case 'list': {
      const items = clean(block.items);
      if (items.length === 0) return null;
      const className = 'text-muted-foreground space-y-1 pl-5 text-sm leading-6';
      return block.ordered ? (
        <ol className={`list-decimal ${className}`}>
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      ) : (
        <ul className={`list-disc ${className}`}>
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    }
    case 'image':
      if (!block.url.trim()) return null;
      return (
        <figure>
          <img
            src={block.url}
            alt={block.alt || block.caption || ''}
            className="w-full rounded-lg border object-cover"
          />
          {block.caption ? (
            <figcaption className="text-muted-foreground mt-1.5 text-center text-xs">
              {block.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    case 'imageText': {
      if (!block.url.trim() && !block.title?.trim() && !block.text?.trim()) return null;
      return (
        <div
          className={`flex flex-col gap-4 sm:flex-row sm:items-center ${
            block.mediaSide === 'right' ? 'sm:flex-row-reverse' : ''
          }`}
        >
          {block.url.trim() ? (
            <img
              src={block.url}
              alt={block.title || ''}
              className="w-full rounded-lg border object-cover sm:w-44"
            />
          ) : null}
          <div className="flex-1">
            {block.title?.trim() ? <h4 className="text-base font-semibold">{block.title}</h4> : null}
            {block.text?.trim() ? (
              <p className="text-muted-foreground mt-1 text-sm leading-7 whitespace-pre-line">
                {block.text}
              </p>
            ) : null}
          </div>
        </div>
      );
    }
    case 'stats': {
      const items = clean(block.items);
      if (items.length === 0) return null;
      return (
        <div className="flex flex-wrap gap-2">
          {items.map((item, index) => (
            <span key={index} className="rounded-full border bg-slate-50 px-3 py-1 text-sm">
              {item}
            </span>
          ))}
        </div>
      );
    }
    case 'testimonials': {
      const items = clean(block.items);
      if (items.length === 0) return null;
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item, index) => (
            <blockquote
              key={index}
              className="text-muted-foreground rounded-lg border bg-slate-50 p-4 text-sm leading-7"
            >
              “{item}”
            </blockquote>
          ))}
        </div>
      );
    }
    case 'cta':
      if (!block.text.trim()) return null;
      // Inert in the preview — the real link works on the public site.
      return (
        <span className="btn btn-primary pointer-events-none inline-flex">{block.text}</span>
      );
    case 'gallery': {
      const urls = clean(block.urls);
      if (urls.length === 0) return null;
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {urls.map((url, index) => (
            <img
              key={index}
              src={url}
              alt=""
              className="aspect-square w-full rounded-lg border object-cover"
            />
          ))}
        </div>
      );
    }
    case 'faq': {
      const items = block.items.filter((item) => item.q.trim() || item.a.trim());
      if (items.length === 0) return null;
      return (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index}>
              {item.q.trim() ? <div className="text-sm font-semibold">{item.q}</div> : null}
              {item.a.trim() ? (
                <p className="text-muted-foreground mt-1 text-sm leading-6 whitespace-pre-line">
                  {item.a}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      );
    }
    case 'divider':
      return <hr className="border-t" />;
  }
}
