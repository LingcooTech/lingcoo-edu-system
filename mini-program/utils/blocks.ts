let idCounter = 0;

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'image'
  | 'imageText'
  | 'stats'
  | 'testimonials'
  | 'cta'
  | 'gallery'
  | 'faq'
  | 'divider';

export interface FaqItem {
  q: string;
  a: string;
}

export type Block =
  | { id: string; type: 'heading'; text: string; level: 2 | 3 }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'list'; ordered: boolean; items: string[] }
  | { id: string; type: 'image'; url: string; caption?: string; alt?: string }
  | { id: string; type: 'imageText'; url: string; title?: string; text?: string; mediaSide: 'left' | 'right' }
  | { id: string; type: 'stats'; items: string[] }
  | { id: string; type: 'testimonials'; items: string[] }
  | { id: string; type: 'cta'; text: string; link: string }
  | { id: string; type: 'gallery'; urls: string[] }
  | { id: string; type: 'faq'; items: FaqItem[] }
  | { id: string; type: 'divider' };

interface BlockDoc {
  version: 1;
  blocks: Block[];
}

function genId(): string {
  idCounter += 1;
  return `mp_${Date.now().toString(36)}_${idCounter}`;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter((item) => item.length > 0);
}

function normalizeBlock(raw: unknown): Block | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const type = record.type;
  const id = asString(record.id) || genId();

  switch (type) {
    case 'heading':
      return { id, type, text: asString(record.text), level: record.level === 3 ? 3 : 2 };
    case 'paragraph':
      return { id, type, text: asString(record.text) };
    case 'list':
      return { id, type, ordered: record.ordered === true, items: asStringList(record.items) };
    case 'image':
      return {
        id,
        type,
        url: asString(record.url),
        caption: asString(record.caption),
        alt: asString(record.alt),
      };
    case 'imageText':
      return {
        id,
        type,
        url: asString(record.url),
        title: asString(record.title),
        text: asString(record.text),
        mediaSide: record.mediaSide === 'right' ? 'right' : 'left',
      };
    case 'stats':
      return { id, type, items: asStringList(record.items) };
    case 'testimonials':
      return { id, type, items: asStringList(record.items) };
    case 'cta':
      return { id, type, text: asString(record.text), link: asString(record.link) };
    case 'gallery':
      return { id, type, urls: asStringList(record.urls) };
    case 'faq': {
      const rawItems = Array.isArray(record.items) ? record.items : [];
      const items = rawItems
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const entry = item as Record<string, unknown>;
          return { q: asString(entry.q), a: asString(entry.a) };
        })
        .filter((item): item is FaqItem => Boolean(item) && (item!.q !== '' || item!.a !== ''));
      return { id, type, items };
    }
    case 'divider':
      return { id, type };
    default:
      return null;
  }
}

function sanitizeBlocks(value: unknown[]): Block[] {
  return value.map(normalizeBlock).filter((block): block is Block => block !== null);
}

function parseMarkdownImage(value: string) {
  const match = value.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
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

function textFromHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[^>]+>/g, '')
      .trim(),
  );
}

function parseLegacyHtml(value: string): Block[] {
  const blocks: Block[] = [];
  const tokenPattern =
    /<h([23])[^>]*>([\s\S]*?)<\/h\1>|<p[^>]*>([\s\S]*?)<\/p>|<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(value)) !== null) {
    if (match[1] && match[2]) {
      const text = textFromHtml(match[2]);
      if (text) {
        blocks.push({ id: genId(), type: 'heading', level: match[1] === '3' ? 3 : 2, text });
      }
      continue;
    }

    if (match[3]) {
      const text = textFromHtml(match[3]);
      if (text) blocks.push({ id: genId(), type: 'paragraph', text });
      continue;
    }

    if (match[4]) {
      blocks.push({ id: genId(), type: 'image', url: decodeHtmlEntities(match[4]), caption: '' });
    }
  }

  if (blocks.length > 0) return blocks;

  const text = textFromHtml(value);
  return text ? [{ id: genId(), type: 'paragraph', text }] : [];
}

function flushParagraph(blocks: Block[], paragraph: string[]) {
  if (paragraph.length === 0) return;
  blocks.push({ id: genId(), type: 'paragraph', text: paragraph.join('\n') });
  paragraph.length = 0;
}

function parseLegacyMarkdown(value: string): Block[] {
  const blocks: Block[] = [];
  const paragraph: string[] = [];
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(blocks, paragraph);
      index += 1;
      continue;
    }

    const image = parseMarkdownImage(trimmed);
    if (image) {
      flushParagraph(blocks, paragraph);
      blocks.push({ id: genId(), type: 'image', url: image.url, alt: image.alt, caption: '' });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flushParagraph(blocks, paragraph);
      blocks.push({ id: genId(), type: 'heading', level: 3, text: trimmed.slice(4).trim() });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushParagraph(blocks, paragraph);
      blocks.push({ id: genId(), type: 'heading', level: 2, text: trimmed.slice(3).trim() });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('- ')) {
      flushParagraph(blocks, paragraph);
      const items: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('- ')) {
        items.push(lines[index].trim().slice(2).trim());
        index += 1;
      }
      blocks.push({ id: genId(), type: 'list', ordered: false, items });
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph(blocks, paragraph);
  return blocks;
}

export function parseBlocks(value: unknown): Block[] {
  if (Array.isArray(value)) return sanitizeBlocks(value);
  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if (/^<[\s\S]*>$/.test(trimmed)) {
    return parseLegacyHtml(trimmed);
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return sanitizeBlocks(parsed);
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as BlockDoc).blocks)) {
        return sanitizeBlocks((parsed as BlockDoc).blocks);
      }
    } catch {
      // Treat invalid JSON as legacy text.
    }
  }

  return parseLegacyMarkdown(value);
}
