import { useRef, useState } from 'react';
import { Bold, Heading2, Image, Italic, Link, List, Quote, UploadCloud } from 'lucide-react';

import { uploadQiniuImage } from '@/api/client';
import { useToast } from '@/components/shared/Toast';

interface Tool {
  label: string;
  icon: typeof Bold;
  apply: (selection: string) => string;
}

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

  function replaceSelection(replacement: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${value}${value ? '\n\n' : ''}${replacement}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const next = `${before}${replacement}${after}`;
    onChange(next);

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + replacement.length);
    });
  }

  function applyTool(tool: Tool) {
    const textarea = textareaRef.current;
    const selection = textarea ? value.slice(textarea.selectionStart, textarea.selectionEnd) : '';
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
