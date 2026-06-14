import { Fragment, type ReactNode } from 'react';

import { Link } from 'react-router-dom';

type Segment =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'list'; items: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'image'; alt: string; url: string };

function parseImage(line: string) {
  const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  return match ? { alt: match[1] || '', url: match[2] || '' } : null;
}

function flushParagraph(segments: Segment[], paragraph: string[]) {
  if (paragraph.length > 0) {
    segments.push({ type: 'paragraph', lines: [...paragraph] });
    paragraph.length = 0;
  }
}

function parseContent(value: string): Segment[] {
  const segments: Segment[] = [];
  const paragraph: string[] = [];
  const lines = value.split('\n');
  let index = 0;

  while (index < lines.length) {
    const raw = lines[index];
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(segments, paragraph);
      index += 1;
      continue;
    }

    const image = parseImage(trimmed);
    if (image) {
      flushParagraph(segments, paragraph);
      segments.push({ type: 'image', alt: image.alt, url: image.url });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flushParagraph(segments, paragraph);
      segments.push({ type: 'heading', level: 3, text: trimmed.slice(4).trim() });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushParagraph(segments, paragraph);
      segments.push({ type: 'heading', level: 2, text: trimmed.slice(3).trim() });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('- ')) {
      flushParagraph(segments, paragraph);
      const items: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('- ')) {
        items.push(lines[index].trim().slice(2).trim());
        index += 1;
      }
      segments.push({ type: 'list', items });
      continue;
    }

    if (trimmed.startsWith('> ')) {
      flushParagraph(segments, paragraph);
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('> ')) {
        quoteLines.push(lines[index].trim().slice(2).trim());
        index += 1;
      }
      segments.push({ type: 'quote', lines: quoteLines });
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph(segments, paragraph);
  return segments;
}

function isSafeLink(href: string) {
  return href.startsWith('/') || /^https?:\/\//i.test(href);
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }

    if (match[2]) {
      parts.push(<strong key={parts.length}>{match[2]}</strong>);
    } else if (match[4]) {
      parts.push(<em key={parts.length}>{match[4]}</em>);
    } else if (match[6] && match[7] && isSafeLink(match[7])) {
      const href = match[7];
      parts.push(
        href.startsWith('/') ? (
          <Link
            key={parts.length}
            to={href}
            className="text-brand font-medium underline underline-offset-4"
          >
            {match[6]}
          </Link>
        ) : (
          <a
            key={parts.length}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-brand font-medium underline underline-offset-4"
          >
            {match[6]}
          </a>
        ),
      );
    } else {
      parts.push(match[0]);
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

export function RichTextRenderer({ content }: { content: string }) {
  const segments = parseContent(content);
  if (segments.length === 0) return null;

  return (
    <div className="space-y-6">
      {segments.map((segment, index) => {
        switch (segment.type) {
          case 'heading':
            return segment.level === 3 ? (
              <h3 key={index} className="text-ink text-lg font-semibold">
                {renderInline(segment.text)}
              </h3>
            ) : (
              <h2 key={index} className="section-title">
                {renderInline(segment.text)}
              </h2>
            );
          case 'paragraph':
            return (
              <p key={index} className="text-ink-soft text-sm leading-7">
                {segment.lines.map((line, lineIndex) => (
                  <Fragment key={lineIndex}>
                    {lineIndex > 0 ? <br /> : null}
                    {renderInline(line)}
                  </Fragment>
                ))}
              </p>
            );
          case 'list':
            return (
              <ul key={index} className="text-ink-soft list-disc space-y-1 pl-5 text-sm leading-7">
                {segment.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case 'quote':
            return (
              <blockquote
                key={index}
                className="border-brand/30 text-ink-soft border-l-4 pl-4 text-sm leading-7"
              >
                {segment.lines.map((line, lineIndex) => (
                  <Fragment key={lineIndex}>
                    {lineIndex > 0 ? <br /> : null}
                    {renderInline(line)}
                  </Fragment>
                ))}
              </blockquote>
            );
          case 'image':
            return (
              <figure key={index}>
                <img
                  src={segment.url}
                  alt={segment.alt}
                  loading="lazy"
                  decoding="async"
                  className="border-line w-full rounded-2xl border object-cover"
                />
              </figure>
            );
        }
      })}
    </div>
  );
}
