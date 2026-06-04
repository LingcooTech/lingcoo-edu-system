import { randomUUID } from 'node:crypto';

/**
 * Server-side content-block model + sanitizer for the institution home page's
 * `publicProfile.bodyBlocks`. Mirrors the frontend block model
 * (admin-ui/src/components/editor/blocks.ts) but runs in Node with no React.
 *
 * `normalizeBlocks` validates/coerces untrusted input (admin-authored JSON) into
 * a bounded, well-typed Block[] before it is persisted to the settings store,
 * dropping unknown block types and over-long lists. Text is never executed —
 * the public site renders these as escaped React children.
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

export interface FaqItem {
  q: string;
  a: string;
}

export type Block =
  | { id: string; type: 'heading'; text: string; level: 2 | 3 }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'list'; ordered: boolean; items: string[] }
  | { id: string; type: 'image'; url: string; caption?: string; alt?: string }
  | {
      id: string;
      type: 'imageText';
      url: string;
      title?: string;
      text?: string;
      mediaSide: 'left' | 'right';
    }
  | { id: string; type: 'stats'; items: string[] }
  | { id: string; type: 'testimonials'; items: string[] }
  | { id: string; type: 'cta'; text: string; link: string }
  | { id: string; type: 'gallery'; urls: string[] }
  | { id: string; type: 'faq'; items: FaqItem[] }
  | { id: string; type: 'divider' };

const MAX_BLOCKS = 200;
const MAX_LIST_ITEMS = 50;
const MAX_TEXT = 5000;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT) : '';
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asString)
    .filter((item) => item.length > 0)
    .slice(0, MAX_LIST_ITEMS);
}

function normalizeBlock(raw: unknown): Block | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const type = record.type;
  const id = asString(record.id) || randomUUID();

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
        .filter((item): item is FaqItem => item !== null && (item.q !== '' || item.a !== ''))
        .slice(0, MAX_LIST_ITEMS);
      return { id, type, items };
    }
    case 'divider':
      return { id, type };
    default:
      return null;
  }
}

/** Coerce untrusted input into a bounded Block[]; returns [] for non-arrays. */
export function normalizeBlocks(value: unknown): Block[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_BLOCKS)
    .map(normalizeBlock)
    .filter((block): block is Block => block !== null);
}
