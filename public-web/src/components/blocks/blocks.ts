/**
 * Public-web mirror of the content-block model. Renders module content authored
 * in the admin (institution home bodyBlocks, teacher bio, course detail, campaign
 * body) so the public site matches the admin live preview.
 *
 * This is the read/parse half only — no editor-side exports. Structurally
 * identical to admin-ui/src/components/editor/blocks.ts (the repo has no shared
 * package; type duplication is the existing convention). All text is rendered as
 * escaped React children — never via dangerouslySetInnerHTML.
 */

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

export interface HeadingBlock {
  id: string;
  type: 'heading';
  text: string;
  level: 2 | 3;
}
export interface ParagraphBlock {
  id: string;
  type: 'paragraph';
  text: string;
}
export interface ListBlock {
  id: string;
  type: 'list';
  ordered: boolean;
  items: string[];
}
export interface ImageBlock {
  id: string;
  type: 'image';
  url: string;
  caption?: string;
  alt?: string;
}
export interface ImageTextBlock {
  id: string;
  type: 'imageText';
  url: string;
  title?: string;
  text?: string;
  mediaSide: 'left' | 'right';
}
export interface StatsBlock {
  id: string;
  type: 'stats';
  items: string[];
}
export interface TestimonialsBlock {
  id: string;
  type: 'testimonials';
  items: string[];
}
export interface CtaBlock {
  id: string;
  type: 'cta';
  text: string;
  link: string;
}
export interface GalleryBlock {
  id: string;
  type: 'gallery';
  urls: string[];
}
export interface FaqItem {
  q: string;
  a: string;
}
export interface FaqBlock {
  id: string;
  type: 'faq';
  items: FaqItem[];
}
export interface DividerBlock {
  id: string;
  type: 'divider';
}

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | ImageBlock
  | ImageTextBlock
  | StatsBlock
  | TestimonialsBlock
  | CtaBlock
  | GalleryBlock
  | FaqBlock
  | DividerBlock;

export interface BlockDoc {
  version: 1;
  blocks: Block[];
}

let idCounter = 0;
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `b_${Date.now().toString(36)}_${idCounter}`;
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
      const items: FaqItem[] = rawItems
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

/**
 * Parse stored content into Block[], tolerant of an actual Block[], a serialized
 * BlockDoc/Block[] JSON string, or legacy plain text (wrapped as one paragraph).
 */
export function parseBlocks(value: unknown): Block[] {
  if (Array.isArray(value)) return sanitizeBlocks(value);
  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return sanitizeBlocks(parsed);
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as BlockDoc).blocks)) {
        return sanitizeBlocks((parsed as BlockDoc).blocks);
      }
    } catch {
      // Not JSON — treat the whole string as legacy plain text.
    }
  }

  return [{ id: genId(), type: 'paragraph', text: value }];
}
