/**
 * Shared content-block model for the reusable module editor.
 *
 * Content authored in the admin (institution home, teacher bio, course detail,
 * campaign body) is an ordered list of typed "modules" (blocks). The same shape
 * is rendered by <BlockRenderer> here (admin live preview) and by the mirrored
 * renderer in public-web, so the back-office preview matches what parents see.
 *
 * Blocks are plain data edited through simple form inputs (no contenteditable),
 * and rendered as escaped React text — never via dangerouslySetInnerHTML.
 *
 * NOTE: kept framework-agnostic (no JSX) so it can be imported anywhere. A
 * structurally identical copy lives at public-web/src/components/blocks/blocks.ts
 * (the repo has no shared package; type duplication is the existing convention).
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

/** Human labels for the "add module" palette. */
export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: '标题',
  paragraph: '段落',
  list: '列表',
  image: '图片',
  imageText: '图文',
  stats: '数据条',
  testimonials: '评价',
  cta: '行动按钮',
  gallery: '图库',
  faq: '常见问题',
  divider: '分隔线',
};

export const ALL_BLOCK_TYPES: BlockType[] = [
  'heading',
  'paragraph',
  'list',
  'image',
  'imageText',
  'stats',
  'testimonials',
  'cta',
  'gallery',
  'faq',
  'divider',
];

// Per-surface palettes. The institution home gets the full set; the others use
// a body-content subset. Passed to <BlockEditor allowed={...} />.
export const HOME_ALLOWED: BlockType[] = ALL_BLOCK_TYPES;
export const TEACHER_ALLOWED: BlockType[] = [
  'heading',
  'paragraph',
  'list',
  'image',
  'imageText',
  'divider',
];
export const COURSE_ALLOWED: BlockType[] = [
  'heading',
  'paragraph',
  'list',
  'image',
  'imageText',
  'faq',
  'cta',
  'divider',
];
export const CAMPAIGN_ALLOWED: BlockType[] = [
  'heading',
  'paragraph',
  'list',
  'image',
  'imageText',
  'stats',
  'cta',
  'divider',
];

let idCounter = 0;
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `b_${Date.now().toString(36)}_${idCounter}`;
}

/** Create an empty block of the given type with sensible defaults. */
export function newBlock(type: BlockType): Block {
  const id = genId();
  switch (type) {
    case 'heading':
      return { id, type, text: '', level: 2 };
    case 'paragraph':
      return { id, type, text: '' };
    case 'list':
      return { id, type, ordered: false, items: [] };
    case 'image':
      return { id, type, url: '', caption: '', alt: '' };
    case 'imageText':
      return { id, type, url: '', title: '', text: '', mediaSide: 'left' };
    case 'stats':
      return { id, type, items: [] };
    case 'testimonials':
      return { id, type, items: [] };
    case 'cta':
      return { id, type, text: '', link: '' };
    case 'gallery':
      return { id, type, urls: [] };
    case 'faq':
      return { id, type, items: [] };
    case 'divider':
      return { id, type };
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter((item) => item.length > 0);
}

/**
 * Coerce one raw object into a valid Block, filling defaults and dropping
 * unknown types. Returns null when the input can't be a block.
 */
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
 * Parse stored content into Block[], tolerant of three shapes:
 *  1. an actual Block[] (e.g. publicSite.aboutPage.bodyBlocks from the API),
 *  2. a serialized BlockDoc / Block[] JSON string (course/teacher/campaign text columns),
 *  3. legacy plain text (existing course.content) -> wrapped as one paragraph block.
 * This makes the editor backward-compatible with zero data migration.
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
      // Not JSON — fall through to treat the whole string as legacy plain text.
    }
  }

  return [{ id: genId(), type: 'paragraph', text: value }];
}

/** Serialize blocks to a JSON string for storage in a text column. */
export function serializeBlocks(blocks: Block[]): string {
  const doc: BlockDoc = { version: 1, blocks };
  return JSON.stringify(doc);
}

/** True when the document has no rendered content (used to hide empty sections). */
export function isEmptyBlocks(blocks: Block[]): boolean {
  return blocks.length === 0;
}
