import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bold, Heading2, Image, Italic, Link, List, Quote, UploadCloud } from 'lucide-react';

import { uploadQiniuImage } from '@/api/client';
import { useToast } from '@/components/shared/Toast';

interface Tool {
  label: string;
  icon: typeof Bold;
  apply: (selection: string) => string;
}

type PreviewSegment =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'list'; items: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'image'; alt: string; url: string };

const TOOLS: Tool[] = [
  {
    label: '标题',
    icon: Heading2,
    apply: (selection) => `## ${selection || '小标题'}`,
  },
  {
    label: '加粗',
    icon: Bold,
    apply: (selection) => `**${selection || '重点文字'}**`,
  },
  {
    label: '斜体',
    icon: Italic,
    apply: (selection) => `*${selection || '强调文字'}*`,
  },
  {
    label: '列表',
    icon: List,
    apply: (selection) =>
      selection
        ? selection
            .split('\n')
            .map((line) => (line.trim() ? `- ${line.replace(/^- /, '')}` : line))
            .join('\n')
        : '- 列表项',
  },
  {
    label: '引用',
    icon: Quote,
    apply: (selection) =>
      selection
        ? selection
            .split('\n')
            .map((line) => (line.trim() ? `> ${line.replace(/^> /, '')}` : line))
            .join('\n')
        : '> 引用内容',
  },
  {
    label: '链接',
    icon: Link,
    apply: (selection) => `[${selection || '链接文字'}](https://)`,
  },
];

function parseImage(line: string) {
  const match = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
  return match ? { alt: match[1] || '', url: match[2] || '' } : null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[^>]+>/g, '')
      .trim(),
  );
}

function htmlToMarkdown(value: string) {
  let next = value.replace(/\r\n/g, '\n');

  next = next.replace(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, (_, url, alt) => {
    return `\n\n![${stripHtml(alt)}](${decodeHtmlEntities(url)})\n\n`;
  });
  next = next.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/gi, (_, alt, url) => {
    return `\n\n![${stripHtml(alt)}](${decodeHtmlEntities(url)})\n\n`;
  });
  next = next.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (_, url) => {
    return `\n\n![](${decodeHtmlEntities(url)})\n\n`;
  });
  next = next.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, text) => `\n\n## ${stripHtml(text)}\n\n`);
  next = next.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, text) => `\n\n## ${stripHtml(text)}\n\n`);
  next = next.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, text) => `\n\n### ${stripHtml(text)}\n\n`);
  next = next.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, text) => {
    return `\n\n${stripHtml(text)
      .split('\n')
      .map((line) => (line.trim() ? `> ${line.trim()}` : line))
      .join('\n')}\n\n`;
  });
  next = next.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, text) => `\n- ${stripHtml(text)}`);
  next = next.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');
  next = next.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, text) => `\n\n${stripHtml(text)}\n\n`);
  next = stripHtml(next);

  return next
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function normalizeEditorValue(value: string) {
  return looksLikeHtml(value) ? htmlToMarkdown(value) : value;
}

function flushParagraph(segments: PreviewSegment[], paragraph: string[]) {
  if (paragraph.length === 0) return;
  segments.push({ type: 'paragraph', lines: [...paragraph] });
  paragraph.length = 0;
}

function parsePreview(value: string): PreviewSegment[] {
  const segments: PreviewSegment[] = [];
  const paragraph: string[] = [];
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trimEnd();
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
      parts.push(
        <a
          key={parts.length}
          href={match[7]}
          target="_blank"
          rel="noreferrer"
          className="text-brand font-medium underline underline-offset-4"
        >
          {match[6]}
        </a>,
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

function MarkdownPreview({ segments }: { segments: PreviewSegment[] }) {
  if (segments.length === 0) return null;
  return (
    <div className="border-border/80 bg-muted/20 border-t p-4">
      <div className="text-muted-foreground mb-3 text-xs font-medium">预览</div>
      <div className="space-y-4">
        {segments.map((segment, index) => {
          switch (segment.type) {
            case 'heading':
              return segment.level === 3 ? (
                <h4 key={index} className="text-base font-semibold">
                  {renderInline(segment.text)}
                </h4>
              ) : (
                <h3 key={index} className="text-xl font-semibold tracking-tight">
                  {renderInline(segment.text)}
                </h3>
              );
            case 'paragraph':
              return (
                <p key={index} className="text-muted-foreground text-sm leading-7">
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
                <ul key={index} className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                  {segment.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{renderInline(item)}</li>
                  ))}
                </ul>
              );
            case 'quote':
              return (
                <blockquote
                  key={index}
                  className="border-brand/40 text-muted-foreground border-l-4 pl-4 text-sm leading-7"
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
                    className="w-full rounded-lg border object-cover"
                  />
                </figure>
              );
          }
        })}
      </div>
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  prefix,
}: {
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
}) {
  const toast = useToast();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const editorValue = useMemo(() => normalizeEditorValue(value), [value]);
  const previewSegments = useMemo(() => parsePreview(editorValue), [editorValue]);

  function replaceSelection(replacement: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${editorValue}${editorValue ? '\n\n' : ''}${replacement}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = editorValue.slice(0, start);
    const after = editorValue.slice(end);
    const next = `${before}${replacement}${after}`;
    onChange(next);

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + replacement.length);
    });
  }

  function applyTool(tool: Tool) {
    const textarea = textareaRef.current;
    const selection = textarea
      ? editorValue.slice(textarea.selectionStart, textarea.selectionEnd)
      : '';
    replaceSelection(tool.apply(selection));
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const result = await uploadQiniuImage(file, prefix);
      replaceSelection(`![${file.name.replace(/\.[^.]+$/, '') || '图片'}](${result.publicUrl})`);
      toast.success('图片已上传并插入正文');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border-border/80 bg-background overflow-hidden rounded-lg border">
      <div className="border-border/80 bg-muted/30 flex flex-wrap items-center gap-1 border-b px-2 py-2">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.label}
              type="button"
              className="btn btn-ghost h-8 px-2"
              title={tool.label}
              aria-label={tool.label}
              onClick={() => applyTool(tool)}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
        <button
          type="button"
          className="btn btn-ghost h-8 px-2"
          title="上传图片"
          aria-label="上传图片"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <UploadCloud className="h-4 w-4 animate-pulse" />
          ) : (
            <Image className="h-4 w-4" />
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void upload(file);
          }}
        />
      </div>
      <textarea
        ref={textareaRef}
        className="bg-background min-h-80 w-full resize-y px-3 py-3 text-sm leading-6 outline-none"
        value={editorValue}
        onChange={(event) => onChange(event.target.value)}
      />
      <MarkdownPreview segments={previewSegments} />
    </div>
  );
}
