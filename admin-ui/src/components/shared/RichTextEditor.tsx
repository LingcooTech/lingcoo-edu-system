import { useEffect, useRef, useState } from 'react';
import { Bold, Heading2, Image, Images, Italic, Link, List, Quote, UploadCloud } from 'lucide-react';

import { uploadQiniuImage } from '@/api/client';
import { useToast } from '@/components/shared/Toast';

interface Tool {
  label: string;
  icon: typeof Bold;
  apply: () => void;
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function parseMarkdownImage(value: string) {
  const match = value.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  return match ? { alt: match[1] || '', url: match[2] || '' } : null;
}

function markdownInlineToHtml(value: string) {
  return htmlEscape(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+|\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    );
}

function markdownToHtml(value: string) {
  const html: string[] = [];
  const paragraph: string[] = [];
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${markdownInlineToHtml(paragraph.join(' '))}</p>`);
    paragraph.length = 0;
  }

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (line === ':::image-scroll') {
      flushParagraph();
      const figures: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== ':::') {
        const image = parseMarkdownImage(lines[index].trim());
        if (image) {
          figures.push(
            `<figure><img src="${htmlEscape(image.url)}" alt="${htmlEscape(image.alt)}" /></figure>`,
          );
        }
        index += 1;
      }
      if (index < lines.length && lines[index].trim() === ':::') index += 1;
      html.push(`<div class="article-image-scroll" data-role="image-scroll">${figures.join('')}</div>`);
      continue;
    }

    const image = parseMarkdownImage(line);
    if (image) {
      flushParagraph();
      html.push(`<figure><img src="${htmlEscape(image.url)}" alt="${htmlEscape(image.alt)}" /></figure>`);
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      html.push(`<h${level}>${markdownInlineToHtml(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph();
  return html.join('\n');
}

function editorButton(label: string, action: string) {
  return `<button type="button" data-editor-ui="true" data-editor-action="${action}" class="editor-inline-button">${label}</button>`;
}

function buildFigureHtml(url: string, alt: string) {
  return `<figure contenteditable="false" data-editor-widget="image"><img src="${htmlEscape(url)}" alt="${htmlEscape(
    alt,
  )}" />${editorButton('移除', 'remove-widget')}</figure>`;
}

function buildImageScrollHtml(images: Array<{ url: string; alt: string }> = []) {
  const figures = images
    .map((image) => `<figure><img src="${htmlEscape(image.url)}" alt="${htmlEscape(image.alt)}" /></figure>`)
    .join('');
  return `<div class="article-image-scroll" data-role="image-scroll" data-editor-widget="image-scroll" contenteditable="false">${figures}<div data-editor-ui="true" class="editor-scroll-actions">${editorButton(
    '上传图片',
    'upload-scroll-image',
  )}${editorButton('移除', 'remove-widget')}</div></div>`;
}

function imagesFromScrollTarget(target: HTMLElement) {
  return [...target.querySelectorAll('figure img')]
    .map((image) => ({
      url: image.getAttribute('src') || '',
      alt: image.getAttribute('alt') || '',
    }))
    .filter((image) => image.url);
}

function decorateEditorHtml(value: string) {
  const source = looksLikeHtml(value) ? value : markdownToHtml(value);
  const doc = new DOMParser().parseFromString(`<main>${source || '<p><br></p>'}</main>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;

  root.querySelectorAll('[data-editor-ui]').forEach((node) => node.remove());
  root.querySelectorAll('[contenteditable]').forEach((node) => node.removeAttribute('contenteditable'));
  root.querySelectorAll('[data-editor-widget]').forEach((node) => node.removeAttribute('data-editor-widget'));

  root.querySelectorAll('div.article-image-scroll, div[data-role="image-scroll"]').forEach((node) => {
    const element = node as HTMLElement;
    element.classList.add('article-image-scroll');
    element.setAttribute('data-role', 'image-scroll');
    element.setAttribute('data-editor-widget', 'image-scroll');
    element.setAttribute('contenteditable', 'false');
    element.insertAdjacentHTML(
      'beforeend',
      `<div data-editor-ui="true" class="editor-scroll-actions">${editorButton(
        '上传图片',
        'upload-scroll-image',
      )}${editorButton('移除', 'remove-widget')}</div>`,
    );
  });

  root.querySelectorAll('figure').forEach((node) => {
    if (node.closest('.article-image-scroll')) return;
    const figure = node as HTMLElement;
    figure.setAttribute('contenteditable', 'false');
    figure.setAttribute('data-editor-widget', 'image');
    figure.insertAdjacentHTML('beforeend', editorButton('移除', 'remove-widget'));
  });

  return root.innerHTML.trim() || '<p><br></p>';
}

function cleanEditorHtml(value: string) {
  const doc = new DOMParser().parseFromString(`<main>${value}</main>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;

  root.querySelectorAll('[data-editor-ui]').forEach((node) => node.remove());
  root.querySelectorAll('[contenteditable]').forEach((node) => node.removeAttribute('contenteditable'));
  root.querySelectorAll('[data-editor-widget]').forEach((node) => node.removeAttribute('data-editor-widget'));
  root
    .querySelectorAll('[data-active-scroll-upload]')
    .forEach((node) => node.removeAttribute('data-active-scroll-upload'));
  root.querySelectorAll('.article-image-scroll, [data-role="image-scroll"]').forEach((node) => {
    const element = node as HTMLElement;
    element.classList.add('article-image-scroll');
    element.setAttribute('data-role', 'image-scroll');
    if (!element.querySelector('img')) element.remove();
  });

  return root.innerHTML.trim();
}

function isSelectionInside(container: HTMLElement, range: Range) {
  return container.contains(range.commonAncestorContainer);
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
  const editorRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const scrollInputRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const emittedValueRef = useRef<string>('');
  const scrollTargetRef = useRef<HTMLElement | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === emittedValueRef.current) return;
    editor.innerHTML = decorateEditorHtml(value);
  }, [value]);

  function emitCurrentValue() {
    const editor = editorRef.current;
    if (!editor) return;
    const cleanHtml = cleanEditorHtml(editor.innerHTML);
    emittedValueRef.current = cleanHtml;
    onChange(cleanHtml);
  }

  function saveSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (isSelectionInside(editor, range)) savedRangeRef.current = range.cloneRange();
  }

  function restoreSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection) return;
    editor.focus();
    selection.removeAllRanges();
    if (savedRangeRef.current) {
      selection.addRange(savedRangeRef.current);
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.addRange(range);
    savedRangeRef.current = range.cloneRange();
  }

  function insertHtmlAtSelection(html: string) {
    restoreSelection();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const fragment = range.createContextualFragment(`${html}<p><br></p>`);
    const inserted = fragment.firstElementChild as HTMLElement | null;
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      savedRangeRef.current = range.cloneRange();
    }
    emitCurrentValue();
    return inserted;
  }

  function applyCommand(command: string, valueArg?: string) {
    restoreSelection();
    document.execCommand(command, false, valueArg);
    saveSelection();
    emitCurrentValue();
  }

  const tools: Tool[] = [
    { label: '标题', icon: Heading2, apply: () => applyCommand('formatBlock', 'h2') },
    { label: '加粗', icon: Bold, apply: () => applyCommand('bold') },
    { label: '斜体', icon: Italic, apply: () => applyCommand('italic') },
    { label: '列表', icon: List, apply: () => applyCommand('insertUnorderedList') },
    { label: '引用', icon: Quote, apply: () => applyCommand('formatBlock', 'blockquote') },
    {
      label: '链接',
      icon: Link,
      apply: () => {
        const href = window.prompt('输入链接地址');
        if (href) applyCommand('createLink', href);
      },
    },
  ];

  async function uploadSingleImage(file: File) {
    setUploading(true);
    try {
      const result = await uploadQiniuImage(file, prefix);
      insertHtmlAtSelection(buildFigureHtml(result.publicUrl, file.name.replace(/\.[^.]+$/, '') || '图片'));
      toast.success('图片已上传并插入正文');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }

  function setActiveScrollTarget(target: HTMLElement | null) {
    const editor = editorRef.current;
    editor
      ?.querySelectorAll('[data-active-scroll-upload]')
      .forEach((node) => node.removeAttribute('data-active-scroll-upload'));
    scrollTargetRef.current = target;
    target?.setAttribute('data-active-scroll-upload', 'true');
  }

  function getActiveScrollTarget() {
    const editor = editorRef.current;
    if (!editor) return null;
    if (scrollTargetRef.current && editor.contains(scrollTargetRef.current)) {
      return scrollTargetRef.current;
    }
    return editor.querySelector('[data-active-scroll-upload="true"]') as HTMLElement | null;
  }

  async function uploadScrollImages(files: File[]) {
    const target = getActiveScrollTarget();
    if (!target) {
      toast.error('请先点击横向图片组里的上传图片');
      return;
    }
    setUploading(true);
    try {
      const nextImages = imagesFromScrollTarget(target);
      for (const file of files) {
        const result = await uploadQiniuImage(file, prefix);
        const alt = file.name.replace(/\.[^.]+$/, '') || '图片';
        nextImages.push({ url: result.publicUrl, alt });
      }
      target.insertAdjacentHTML('afterend', buildImageScrollHtml(nextImages));
      const replacement = target.nextElementSibling as HTMLElement | null;
      target.remove();
      setActiveScrollTarget(replacement);
      replacement?.removeAttribute('data-active-scroll-upload');
      emitCurrentValue();
      toast.success('图片已添加到横向图片组');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }

  function handleEditorClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const action = target.closest('[data-editor-action]') as HTMLElement | null;
    if (!action) {
      saveSelection();
      return;
    }

    event.preventDefault();
    const widget = action.closest('[data-editor-widget]') as HTMLElement | null;
    switch (action.dataset.editorAction) {
      case 'upload-scroll-image':
        setActiveScrollTarget(action.closest('.article-image-scroll') as HTMLElement | null);
        if (scrollInputRef.current) scrollInputRef.current.value = '';
        scrollInputRef.current?.click();
        break;
      case 'remove-widget':
        widget?.remove();
        emitCurrentValue();
        break;
    }
  }

  return (
    <div className="border-border/80 bg-background min-h-[640px] rounded-lg border">
      <div className="border-border/80 bg-muted/95 sticky top-0 z-30 flex flex-wrap items-center gap-1 rounded-t-lg border-b px-2 py-2 shadow-sm backdrop-blur">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.label}
              type="button"
              className="btn btn-ghost h-8 px-2"
              title={tool.label}
              aria-label={tool.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={tool.apply}
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
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => imageInputRef.current?.click()}
        >
          {uploading ? <UploadCloud className="h-4 w-4 animate-pulse" /> : <Image className="h-4 w-4" />}
        </button>
        <button
          type="button"
          className="btn btn-ghost h-8 px-2"
          title="横向图片组"
          aria-label="横向图片组"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const inserted = insertHtmlAtSelection(buildImageScrollHtml());
            setActiveScrollTarget(inserted);
          }}
        >
          <Images className="h-4 w-4" />
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void uploadSingleImage(file);
          }}
        />
        <input
          ref={scrollInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length) void uploadScrollImages(files);
          }}
        />
      </div>
      <div
        ref={editorRef}
        className="rich-text-editor-content min-h-[620px] p-6 text-base leading-8 outline-none"
        contentEditable
        suppressContentEditableWarning
        onInput={emitCurrentValue}
        onBlur={saveSelection}
        onFocus={saveSelection}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onClick={handleEditorClick}
      />
    </div>
  );
}
