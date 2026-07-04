import { useMemo, useRef, useState } from 'react';
import {
  Bold,
  Heading2,
  Image,
  Images,
  Italic,
  Link,
  List,
  Quote,
  Trash2,
  UploadCloud,
} from 'lucide-react';

import { uploadQiniuImage } from '@/api/client';
import { useToast } from '@/components/shared/Toast';

interface Tool {
  label: string;
  icon: typeof Bold;
  apply: (selection: string) => string;
}

type EditorBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; alt: string; url: string }
  | { type: 'imageScroll'; images: Array<{ alt: string; url: string }> };

type UploadTarget = { type: 'image' } | { type: 'imageScroll'; blockIndex: number };

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

function parseImageFromHtml(value: string) {
  const src = value.match(/\ssrc=["']([^"']+)["']/i)?.[1] ?? '';
  const alt = value.match(/\salt=["']([^"']*)["']/i)?.[1] ?? '';
  return src ? { alt: stripHtml(alt), url: decodeHtmlEntities(src) } : null;
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

  next = next.replace(
    /<div[^>]*(?:class=["'][^"']*article-image-scroll[^"']*["']|data-role=["']image-scroll["'])[^>]*>([\s\S]*?)<\/div>/gi,
    (_, inner) => {
      const images = [...String(inner).matchAll(/<img\b[^>]*>/gi)]
        .map((match) => parseImageFromHtml(match[0]))
        .filter((image): image is { alt: string; url: string } => Boolean(image));
      if (!images.length) return '\n\n';
      return `\n\n:::image-scroll\n${images
        .map((image) => `![${image.alt}](${image.url})`)
        .join('\n')}\n:::\n\n`;
    },
  );
  next = next.replace(
    /<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi,
    (_, url, alt) => {
      return `\n\n![${stripHtml(alt)}](${decodeHtmlEntities(url)})\n\n`;
    },
  );
  next = next.replace(
    /<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/gi,
    (_, alt, url) => {
      return `\n\n![${stripHtml(alt)}](${decodeHtmlEntities(url)})\n\n`;
    },
  );
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

function flushTextBlock(blocks: EditorBlock[], text: string[]) {
  const content = text.join('\n').trim();
  if (content) blocks.push({ type: 'text', text: content });
  text.length = 0;
}

function parseEditorBlocks(value: string): EditorBlock[] {
  const blocks: EditorBlock[] = [];
  const text: string[] = [];
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trimEnd();
    const trimmed = line.trim();

    if (trimmed === ':::image-scroll') {
      flushTextBlock(blocks, text);
      const images: Array<{ alt: string; url: string }> = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== ':::') {
        const image = parseImage(lines[index].trim());
        if (image) images.push(image);
        index += 1;
      }
      blocks.push({ type: 'imageScroll', images });
      if (index < lines.length && lines[index].trim() === ':::') index += 1;
      continue;
    }

    const image = parseImage(trimmed);
    if (image) {
      flushTextBlock(blocks, text);
      blocks.push({ type: 'image', alt: image.alt, url: image.url });
      index += 1;
      continue;
    }

    if (!trimmed && text.length === 0) {
      index += 1;
      continue;
    }

    text.push(line);
    index += 1;
  }

  flushTextBlock(blocks, text);
  return blocks.length ? blocks : [{ type: 'text', text: '' }];
}

function serializeImage(image: { alt: string; url: string }) {
  return `![${image.alt}](${image.url})`;
}

function serializeBlocks(blocks: EditorBlock[]) {
  return blocks
    .map((block) => {
      if (block.type === 'text') return block.text.trim();
      if (block.type === 'image') return block.url.trim() ? serializeImage(block) : '';
      const images = block.images.filter((image) => image.url.trim());
      if (!images.length) return '';
      return `:::image-scroll\n${images.map(serializeImage).join('\n')}\n:::`;
    })
    .filter(Boolean)
    .join('\n\n');
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
  const textRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const [uploading, setUploading] = useState(false);
  const [focusedTextIndex, setFocusedTextIndex] = useState<number | null>(null);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>({ type: 'image' });
  const editorValue = useMemo(() => normalizeEditorValue(value), [value]);
  const blocks = useMemo(() => parseEditorBlocks(editorValue), [editorValue]);

  function emit(nextBlocks: EditorBlock[]) {
    onChange(serializeBlocks(nextBlocks));
  }

  function updateBlock(index: number, nextBlock: EditorBlock) {
    emit(blocks.map((block, blockIndex) => (blockIndex === index ? nextBlock : block)));
  }

  function removeBlock(index: number) {
    const next = blocks.filter((_, blockIndex) => blockIndex !== index);
    emit(next.length ? next : [{ type: 'text', text: '' }]);
  }

  function insertBlock(block: EditorBlock, afterIndex = focusedTextIndex) {
    const next = [...blocks];
    const index = afterIndex === null ? next.length : afterIndex + 1;
    next.splice(index, 0, block);
    emit(next);
  }

  function replaceSelection(replacement: string, blockIndex = focusedTextIndex) {
    if (blockIndex === null || blocks[blockIndex]?.type !== 'text') {
      insertBlock({ type: 'text', text: replacement });
      return;
    }

    const textarea = textRefs.current[blockIndex] ?? textareaRef.current;
    const block = blocks[blockIndex] as Extract<EditorBlock, { type: 'text' }>;
    if (!textarea) {
      updateBlock(blockIndex, {
        ...block,
        text: `${block.text}${block.text ? '\n' : ''}${replacement}`,
      });
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = block.text.slice(0, start);
    const after = block.text.slice(end);
    const next = `${before}${replacement}${after}`;
    updateBlock(blockIndex, { ...block, text: next });

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + replacement.length);
    });
  }

  function applyTool(tool: Tool) {
    const textarea =
      focusedTextIndex === null ? textareaRef.current : textRefs.current[focusedTextIndex];
    const block =
      focusedTextIndex === null || blocks[focusedTextIndex]?.type !== 'text'
        ? null
        : (blocks[focusedTextIndex] as Extract<EditorBlock, { type: 'text' }>);
    const selection = textarea
      ? (block?.text ?? '').slice(textarea.selectionStart, textarea.selectionEnd)
      : '';
    replaceSelection(tool.apply(selection));
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const result = await uploadQiniuImage(file, prefix);
      const image = { alt: file.name.replace(/\.[^.]+$/, '') || '图片', url: result.publicUrl };
      if (
        uploadTarget.type === 'imageScroll' &&
        blocks[uploadTarget.blockIndex]?.type === 'imageScroll'
      ) {
        const block = blocks[uploadTarget.blockIndex] as Extract<
          EditorBlock,
          { type: 'imageScroll' }
        >;
        updateBlock(uploadTarget.blockIndex, { ...block, images: [...block.images, image] });
      } else {
        insertBlock({ type: 'image', ...image });
      }
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
          onClick={() => {
            setUploadTarget({ type: 'image' });
            inputRef.current?.click();
          }}
        >
          {uploading ? (
            <UploadCloud className="h-4 w-4 animate-pulse" />
          ) : (
            <Image className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          className="btn btn-ghost h-8 px-2"
          title="横向图片组"
          aria-label="横向图片组"
          onClick={() => insertBlock({ type: 'imageScroll', images: [] })}
        >
          <Images className="h-4 w-4" />
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
      <div className="space-y-3 p-3">
        {blocks.map((block, index) => {
          if (block.type === 'text') {
            return (
              <textarea
                key={`text-${index}`}
                ref={(node) => {
                  textRefs.current[index] = node;
                  if (index === 0) textareaRef.current = node;
                }}
                className="bg-background border-border/70 focus:border-primary min-h-36 w-full resize-y rounded-lg border px-3 py-3 text-sm leading-6 outline-none"
                value={block.text}
                placeholder="输入正文，可使用工具栏添加标题、列表、引用、链接。"
                onFocus={() => setFocusedTextIndex(index)}
                onChange={(event) => updateBlock(index, { ...block, text: event.target.value })}
              />
            );
          }

          if (block.type === 'image') {
            return (
              <div
                key={`image-${index}`}
                className="border-border/70 bg-muted/15 rounded-lg border p-3"
              >
                {block.url ? (
                  <img
                    src={block.url}
                    alt={block.alt}
                    className="max-h-80 w-full rounded-lg border object-contain"
                  />
                ) : null}
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <input
                    className="form-input"
                    value={block.url}
                    placeholder="图片 URL"
                    onChange={(event) => updateBlock(index, { ...block, url: event.target.value })}
                  />
                  <input
                    className="form-input"
                    value={block.alt}
                    placeholder="图片描述"
                    onChange={(event) => updateBlock(index, { ...block, alt: event.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost text-red-600"
                    onClick={() => removeBlock(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={`scroll-${index}`}
              className="border-border/70 bg-muted/15 rounded-lg border p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">横向图片组</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary h-8 px-2 text-xs"
                    onClick={() => {
                      setUploadTarget({ type: 'imageScroll', blockIndex: index });
                      inputRef.current?.click();
                    }}
                  >
                    上传图片
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost h-8 px-2 text-red-600"
                    onClick={() => removeBlock(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {block.images.map((image, imageIndex) => (
                  <div key={`${image.url}-${imageIndex}`} className="w-48 flex-none space-y-2">
                    {image.url ? (
                      <img
                        src={image.url}
                        alt={image.alt}
                        className="aspect-[4/3] w-full rounded-lg border object-cover"
                      />
                    ) : (
                      <div className="bg-muted flex aspect-[4/3] w-full items-center justify-center rounded-lg border text-xs">
                        图片
                      </div>
                    )}
                    <input
                      className="form-input h-9 text-xs"
                      value={image.url}
                      placeholder="图片 URL"
                      onChange={(event) => {
                        const images = block.images.map((item, itemIndex) =>
                          itemIndex === imageIndex ? { ...item, url: event.target.value } : item,
                        );
                        updateBlock(index, { ...block, images });
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost h-8 w-full text-xs text-red-600"
                      onClick={() => {
                        const images = block.images.filter(
                          (_, itemIndex) => itemIndex !== imageIndex,
                        );
                        updateBlock(index, { ...block, images });
                      }}
                    >
                      移除
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="border-border/70 bg-background text-muted-foreground flex aspect-[4/3] w-48 flex-none items-center justify-center rounded-lg border border-dashed text-sm"
                  onClick={() =>
                    updateBlock(index, {
                      ...block,
                      images: [...block.images, { alt: '', url: '' }],
                    })
                  }
                >
                  添加图片
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
