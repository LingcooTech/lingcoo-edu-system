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

export function parseBlocks(value: unknown): Block[] {
  if (Array.isArray(value)) return sanitizeBlocks(value);
  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

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

  return [{ id: genId(), type: 'paragraph', text: value }];
}
