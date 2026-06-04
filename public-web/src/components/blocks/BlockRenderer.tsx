import { Link } from 'react-router-dom';

import type { Block } from './blocks';

/**
 * Renders Block[] on the public site. Mirrors the admin live-preview renderer's
 * structure using public-web design tokens, so the back-office preview matches
 * what parents see. All text is escaped React children — no dangerouslySetInnerHTML.
 */
export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-6">
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} />
      ))}
    </div>
  );
}

function clean(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}

function CtaLink({ text, link }: { text: string; link: string }) {
  const className = 'pwbtn pwbtn-primary';
  if (/^https?:\/\//i.test(link)) {
    return (
      <a href={link} className={className} target="_blank" rel="noreferrer">
        {text}
      </a>
    );
  }
  return (
    <Link to={link || '/'} className={className}>
      {text}
    </Link>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      if (!block.text.trim()) return null;
      return block.level === 3 ? (
        <h3 className="text-ink text-lg font-semibold">{block.text}</h3>
      ) : (
        <h2 className="section-title">{block.text}</h2>
      );
    }
    case 'paragraph':
      if (!block.text.trim()) return null;
      return <p className="text-ink-soft text-sm leading-7 whitespace-pre-line">{block.text}</p>;
    case 'list': {
      const items = clean(block.items);
      if (items.length === 0) return null;
      const className = 'text-ink-soft space-y-1 pl-5 text-sm leading-7';
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
            className="border-line w-full rounded-2xl border object-cover"
          />
          {block.caption ? (
            <figcaption className="text-muted mt-2 text-center text-xs">{block.caption}</figcaption>
          ) : null}
        </figure>
      );
    case 'imageText': {
      if (!block.url.trim() && !block.title?.trim() && !block.text?.trim()) return null;
      return (
        <div
          className={`flex flex-col gap-5 sm:flex-row sm:items-center ${
            block.mediaSide === 'right' ? 'sm:flex-row-reverse' : ''
          }`}
        >
          {block.url.trim() ? (
            <img
              src={block.url}
              alt={block.title || ''}
              className="border-line w-full rounded-2xl border object-cover sm:w-56"
            />
          ) : null}
          <div className="flex-1">
            {block.title?.trim() ? (
              <h3 className="text-ink text-lg font-semibold">{block.title}</h3>
            ) : null}
            {block.text?.trim() ? (
              <p className="text-ink-soft mt-2 text-sm leading-7 whitespace-pre-line">
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
        <div className="grid gap-3 sm:grid-cols-3">
          {items.map((item, index) => (
            <div key={index} className="bg-paper rounded-2xl px-4 py-3 text-sm font-semibold">
              {item}
            </div>
          ))}
        </div>
      );
    }
    case 'testimonials': {
      const items = clean(block.items);
      if (items.length === 0) return null;
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item, index) => (
            <blockquote key={index} className="pwcard text-ink-soft p-5 text-sm leading-7">
              “{item}”
            </blockquote>
          ))}
        </div>
      );
    }
    case 'cta':
      if (!block.text.trim()) return null;
      return (
        <div>
          <CtaLink text={block.text} link={block.link} />
        </div>
      );
    case 'gallery': {
      const urls = clean(block.urls);
      if (urls.length === 0) return null;
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {urls.map((url, index) => (
            <img
              key={index}
              src={url}
              alt=""
              className="border-line aspect-square w-full rounded-2xl border object-cover"
            />
          ))}
        </div>
      );
    }
    case 'faq': {
      const items = block.items.filter((item) => item.q.trim() || item.a.trim());
      if (items.length === 0) return null;
      return (
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="pwcard p-4">
              {item.q.trim() ? <div className="text-ink text-sm font-semibold">{item.q}</div> : null}
              {item.a.trim() ? (
                <p className="text-ink-soft mt-1.5 text-sm leading-7 whitespace-pre-line">
                  {item.a}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      );
    }
    case 'divider':
      return <hr className="border-line" />;
  }
}
