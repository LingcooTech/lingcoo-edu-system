import * as cheerio from 'cheerio';
import { z } from 'zod';

import * as contentRepo from '../../db/repositories/content.js';
import type { Database } from '../../db/client.js';
import { ContentImportSettingsService } from '../../lib/content-import-settings.js';
import { httpError } from '../../lib/http-error.js';
import type { AppModule } from '../types.js';

type ContentSourceType = contentRepo.ContentSourceType;
type ContentStatus = contentRepo.ContentStatus;

type ImportedContentDraft = {
  title: string;
  excerpt: string;
  content: string;
  coverUrl?: string | null;
  authorName?: string | null;
  sourceType: ContentSourceType;
  sourceId?: string | null;
  sourceUrl?: string | null;
  publishedAt?: Date | null;
  meta?: Record<string, unknown>;
};

const optionalTrimmedString = (max: number) => z.string().trim().max(max).optional();

const contentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: optionalTrimmedString(255),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  sourceType: z.enum(['manual', 'wordpress', 'notion', 'wechat']).optional(),
});

const contentIdParamsSchema = z.object({
  contentId: z.string().uuid(),
});

const publicContentSlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(160),
});

const upsertContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(160).optional(),
  excerpt: z.string().trim().max(500).optional(),
  content: z.string().trim().max(200000).default(''),
  coverUrl: z.string().trim().url().optional().or(z.literal('')),
  authorName: z.string().trim().max(120).optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  sourceType: z.enum(['manual', 'wordpress', 'notion', 'wechat']).default('manual'),
  sourceId: optionalTrimmedString(255),
  sourceUrl: z.string().trim().url().optional().or(z.literal('')),
  publishedAt: z.string().datetime().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const importWordPressContentSchema = z.object({
  siteUrl: z.string().trim().url().optional().or(z.literal('')),
  postUrl: z.string().trim().url(),
  username: optionalTrimmedString(255),
  appPassword: optionalTrimmedString(255),
  status: z.enum(['draft', 'published']).default('draft'),
});

const importNotionContentSchema = z.object({
  apiToken: z.string().trim().optional(),
  pageUrl: z.string().trim().url(),
  status: z.enum(['draft', 'published']).default('draft'),
});

const importWechatContentSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => value.includes('mp.weixin.qq.com'), '请输入有效的微信公众号文章链接'),
  status: z.enum(['draft', 'published']).default('draft'),
});

const NOTION_BLOCK_API_VERSION = '2022-06-28';
const NOTION_MARKDOWN_API_VERSION = '2026-03-11';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readPath(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function normalizeOptionalUrl(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownInlineToHtml(value: string) {
  return htmlEscape(value)
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_match, alt, url) => {
      const safeAlt = htmlEscape(decodeHtmlEntities(String(alt)));
      return `<img src="${url}" alt="${safeAlt}" />`;
    })
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label, url) => {
      const safeLabel = String(label);
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];
  const paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];
  let inCodeBlock = false;
  const codeLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    output.push(`<p>${markdownInlineToHtml(paragraph.join(' '))}</p>`);
    paragraph.length = 0;
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) return;
    output.push(
      `<${listType}>${listItems.map((item) => `<li>${item}</li>`).join('')}</${listType}>`,
    );
    listType = null;
    listItems = [];
  };

  const flushCode = () => {
    if (codeLines.length === 0) return;
    output.push(`<pre><code>${htmlEscape(codeLines.join('\n'))}</code></pre>`);
    codeLines.length = 0;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
        flushCode();
      } else {
        flushParagraph();
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const imageOnly = trimmed.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/);
    if (imageOnly) {
      flushParagraph();
      flushList();
      output.push(
        `<figure><img src="${imageOnly[2]}" alt="${htmlEscape(
          decodeHtmlEntities(imageOnly[1]),
        )}" /></figure>`,
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      output.push(`<h${level}>${markdownInlineToHtml(heading[2])}</h${level}>`);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      output.push(`<blockquote>${markdownInlineToHtml(quote[1])}</blockquote>`);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(markdownInlineToHtml(bullet[1]));
      continue;
    }

    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(markdownInlineToHtml(numbered[1]));
      continue;
    }

    paragraph.push(trimmed);
  }

  if (inCodeBlock) flushCode();
  flushParagraph();
  flushList();

  return output.join('\n');
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function buildExcerpt(content: string, fallback = '') {
  const source = stripHtml(content) || fallback.trim();
  return truncate(source, 180);
}

function basicAuthHeader(username?: string, appPassword?: string) {
  const safeUsername = normalizeString(username);
  const safePassword = normalizeString(appPassword);
  if (!safeUsername || !safePassword) return undefined;
  return `Basic ${Buffer.from(`${safeUsername}:${safePassword}`).toString('base64')}`;
}

function parseWordPressSlugFromUrl(value: string) {
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    return segments.at(-1) ?? '';
  } catch {
    return '';
  }
}

function parseWordPressIdFromUrl(value: string) {
  try {
    const url = new URL(value);
    const numericId = url.searchParams.get('p');
    return numericId && /^\d+$/.test(numericId) ? numericId : '';
  } catch {
    return '';
  }
}

function normalizeNotionId(value: string) {
  const raw = value.trim();
  const cleaned = raw.replace(/[^a-fA-F0-9]/g, '');
  if (cleaned.length !== 32) return raw;

  return [
    cleaned.slice(0, 8),
    cleaned.slice(8, 12),
    cleaned.slice(12, 16),
    cleaned.slice(16, 20),
    cleaned.slice(20),
  ].join('-');
}

function findNotionId(value: string) {
  const uuidMatch = value.match(
    /([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})/,
  );
  if (uuidMatch) return normalizeNotionId(uuidMatch[1]);

  const compactMatch = value.match(/([a-fA-F0-9]{32})/);
  return compactMatch ? normalizeNotionId(compactMatch[1]) : '';
}

function extractNotionPageId(input: { pageUrl?: string; pageId?: string }) {
  const explicitId = normalizeString(input.pageId);
  if (explicitId) return findNotionId(explicitId) || normalizeNotionId(explicitId);

  const pageUrl = normalizeString(input.pageUrl);
  if (!pageUrl) return '';

  try {
    const url = new URL(pageUrl);
    const queryId =
      url.searchParams.get('p') ||
      url.searchParams.get('page_id') ||
      url.searchParams.get('pageId');
    if (queryId) {
      const normalized = findNotionId(queryId);
      if (normalized) return normalized;
    }
  } catch {
    // Fall through to scanning the raw value.
  }

  return findNotionId(pageUrl);
}

function formatNotionError(response: Response, data: unknown) {
  const dataRecord = isRecord(data) ? data : {};
  const code = normalizeString(dataRecord.code);
  const message = normalizeString(dataRecord.message);
  const suffix = message ? `：${message}${code ? ` (${code})` : ''}` : '';
  return `${response.status} ${response.statusText}${suffix}`;
}

type NotionRichText = {
  plain_text?: string;
  href?: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    code?: boolean;
  };
};

type NotionBlock = {
  id?: string;
  type: string;
  has_children?: boolean;
  children?: NotionBlock[];
  [key: string]: unknown;
};

function toNotionBlocks(value: unknown): NotionBlock[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is NotionBlock => isRecord(item) && typeof item.type === 'string',
  );
}

function renderNotionRichText(items: NotionRichText[] | undefined) {
  if (!Array.isArray(items) || items.length === 0) return '';

  return items
    .map((item) => {
      let output = htmlEscape(item.plain_text ?? '');
      if (item.annotations?.code) output = `<code>${output}</code>`;
      if (item.annotations?.bold) output = `<strong>${output}</strong>`;
      if (item.annotations?.italic) output = `<em>${output}</em>`;
      if (item.annotations?.underline) output = `<u>${output}</u>`;
      if (item.annotations?.strikethrough) output = `<s>${output}</s>`;
      if (item.href) {
        output = `<a href="${htmlEscape(item.href)}" target="_blank" rel="noopener noreferrer">${output}</a>`;
      }
      return output;
    })
    .join('');
}

function wrapTag(tag: string, inner: string) {
  return `<${tag}>${inner}</${tag}>`;
}

function renderNotionBlock(block: NotionBlock): string {
  const rawNode = block[block.type];
  const node: Record<string, unknown> = isRecord(rawNode) ? rawNode : {};
  const richText = renderNotionRichText(
    Array.isArray(node.rich_text) ? (node.rich_text as NotionRichText[]) : undefined,
  );
  const nested =
    Array.isArray(block.children) && block.children.length > 0
      ? renderNotionBlocks(block.children)
      : '';

  switch (block.type) {
    case 'paragraph':
      return wrapTag('p', richText || '&nbsp;');
    case 'heading_1':
      return wrapTag('h1', richText);
    case 'heading_2':
      return wrapTag('h2', richText);
    case 'heading_3':
      return wrapTag('h3', richText);
    case 'quote':
      return wrapTag('blockquote', richText + nested);
    case 'callout': {
      const iconRecord = isRecord(node.icon) ? node.icon : {};
      const emoji = normalizeString(iconRecord.emoji);
      const icon = emoji ? `<span>${htmlEscape(emoji)}</span> ` : '';
      return wrapTag('blockquote', `${icon}${richText}${nested}`);
    }
    case 'code':
      return `<pre><code>${htmlEscape(
        (Array.isArray(node.rich_text) ? (node.rich_text as NotionRichText[]) : [])
          .map((item) => item.plain_text ?? '')
          .join(''),
      )}</code></pre>`;
    case 'divider':
      return '<hr />';
    case 'image': {
      const external = isRecord(node.external) ? node.external : {};
      const file = isRecord(node.file) ? node.file : {};
      const imageUrl =
        normalizeString(node.type) === 'external'
          ? normalizeString(external.url)
          : normalizeString(file.url);
      const caption = renderNotionRichText(
        Array.isArray(node.caption) ? (node.caption as NotionRichText[]) : undefined,
      );
      if (!imageUrl) return '';
      return `<figure><img src="${htmlEscape(imageUrl)}" alt="${htmlEscape(
        stripHtml(caption),
      )}" />${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    case 'bookmark': {
      const url = normalizeOptionalUrl(node.url);
      return url
        ? `<p><a href="${htmlEscape(url)}" target="_blank" rel="noopener noreferrer">${htmlEscape(
            url,
          )}</a></p>`
        : '';
    }
    case 'bulleted_list_item':
    case 'numbered_list_item':
      return `<li>${richText}${nested}</li>`;
    case 'toggle':
      return `<details><summary>${richText}</summary>${nested}</details>`;
    case 'child_page':
      return wrapTag('h3', htmlEscape(normalizeString(node.title) || 'Untitled'));
    default:
      return richText ? wrapTag('p', richText + nested) : nested;
  }
}

function renderNotionBlocks(blocks: NotionBlock[]) {
  const output: string[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
      const listTag = block.type === 'bulleted_list_item' ? 'ul' : 'ol';
      const items: string[] = [];

      while (index < blocks.length && blocks[index]?.type === block.type) {
        items.push(renderNotionBlock(blocks[index]));
        index += 1;
      }

      index -= 1;
      output.push(`<${listTag}>${items.join('')}</${listTag}>`);
      continue;
    }

    output.push(renderNotionBlock(block));
  }

  return output.join('\n');
}

class ContentService {
  constructor(private readonly db: Database) {}

  async listContent(query: contentRepo.ContentListQuery) {
    const result = await contentRepo.listContent(this.db, query);
    return {
      items: result.items.map((item) => ({ ...item, excerpt: item.excerpt ?? '' })),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async listPublishedContent(query: { limit: number; offset: number; search?: string }) {
    const result = await contentRepo.listPublishedContent(this.db, query);
    return {
      items: result.items.map((item) => ({ ...item, excerpt: item.excerpt ?? '' })),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getContentById(contentId: string) {
    const item = await contentRepo.findContentById(this.db, contentId);
    if (!item) throw httpError(404, 'Content not found');
    return item;
  }

  async getPublicContentBySlug(slug: string) {
    const item = await contentRepo.findContentBySlug(this.db, slug);
    if (!item || item.status !== 'published') {
      throw httpError(404, 'Content not found');
    }
    return item;
  }

  private async resolveUniqueSlug(baseValue: string, excludeId?: string) {
    const baseSlug = slugify(baseValue) || `content-${Date.now().toString(36)}`;
    let candidate = baseSlug;
    let suffix = 1;

    while (true) {
      const existing = await contentRepo.findContentBySlug(this.db, candidate);
      if (!existing || existing.id === excludeId) return candidate;
      suffix += 1;
      candidate = `${baseSlug}-${suffix}`;
    }
  }

  private async upsertImportedContent(
    draft: ImportedContentDraft,
    inputStatus: 'draft' | 'published',
  ) {
    const existing = await contentRepo.findContentBySource(this.db, {
      sourceType: draft.sourceType,
      sourceId: draft.sourceId,
      sourceUrl: draft.sourceUrl,
    });

    const slug = await this.resolveUniqueSlug(draft.title, existing?.id);
    const payload = {
      slug,
      title: draft.title,
      excerpt: draft.excerpt,
      content: draft.content,
      coverUrl: draft.coverUrl ?? null,
      authorName: draft.authorName ?? null,
      sourceType: draft.sourceType,
      sourceId: draft.sourceId ?? null,
      sourceUrl: draft.sourceUrl ?? null,
      status: existing?.status ?? inputStatus,
      publishedAt: draft.publishedAt ?? (inputStatus === 'published' ? new Date() : null),
      importedAt: new Date(),
      meta: draft.meta ?? {},
    };

    return existing
      ? contentRepo.updateContent(this.db, existing.id, payload)
      : contentRepo.createContent(this.db, {
          ...payload,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
  }

  async upsertContent(
    contentId: string | null,
    input: {
      title: string;
      slug?: string;
      excerpt?: string;
      content: string;
      coverUrl?: string;
      authorName?: string;
      status: ContentStatus;
      sourceType: ContentSourceType;
      sourceId?: string;
      sourceUrl?: string;
      publishedAt?: string;
      meta?: Record<string, unknown>;
    },
  ) {
    const existing = contentId ? await contentRepo.findContentById(this.db, contentId) : null;
    const slug = await this.resolveUniqueSlug(input.slug || input.title, existing?.id);
    const computedPublishedAt =
      input.status === 'published'
        ? input.publishedAt
          ? new Date(input.publishedAt)
          : (existing?.publishedAt ?? new Date())
        : null;
    const excerpt = normalizeString(input.excerpt) || buildExcerpt(input.content, input.title);

    const payload = {
      slug,
      title: input.title.trim(),
      excerpt,
      content: input.content,
      coverUrl: normalizeOptionalUrl(input.coverUrl) ?? null,
      authorName: normalizeString(input.authorName) || null,
      sourceType: input.sourceType,
      sourceId: normalizeString(input.sourceId) || null,
      sourceUrl: normalizeOptionalUrl(input.sourceUrl) ?? null,
      status: input.status,
      publishedAt: computedPublishedAt,
      meta: input.meta ?? existing?.meta ?? {},
      importedAt: existing?.importedAt ?? null,
    };

    return existing
      ? contentRepo.updateContent(this.db, existing.id, payload)
      : contentRepo.createContent(this.db, {
          ...payload,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
  }

  private async requestJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await response.json()) as T;
    return { response, data };
  }

  async importFromWordPress(input: z.infer<typeof importWordPressContentSchema>) {
    const derivedSiteUrl = (() => {
      try {
        const url = new URL(input.postUrl);
        return `${url.protocol}//${url.host}`;
      } catch {
        return '';
      }
    })();
    const siteUrl = (input.siteUrl || derivedSiteUrl).replace(/\/+$/, '');
    if (!siteUrl) throw httpError(422, 'WordPress 站点地址未配置');

    const postUrlId = parseWordPressIdFromUrl(input.postUrl);
    const urlSlug = parseWordPressSlugFromUrl(input.postUrl);
    const requestUrl = postUrlId
      ? `${siteUrl}/wp-json/wp/v2/posts/${encodeURIComponent(postUrlId)}?_embed=1`
      : `${siteUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(urlSlug)}&_embed=1`;

    const auth = basicAuthHeader(input.username, input.appPassword);
    const { response, data } = await this.requestJson<unknown>(requestUrl, {
      headers: auth ? { Authorization: auth } : undefined,
    });

    if (!response.ok) {
      throw httpError(502, `WordPress 导入失败：${response.status} ${response.statusText}`);
    }

    const post = Array.isArray(data) ? data[0] : data;
    if (!isRecord(post) || !post.id) throw httpError(404, '没有找到对应的 WordPress 文章');

    const title = stripHtml(normalizeString(readPath(post, ['title', 'rendered']))) || 'Untitled';
    const contentHtml = normalizeString(readPath(post, ['content', 'rendered']));
    const excerpt = buildExcerpt(normalizeString(readPath(post, ['excerpt', 'rendered'])), title);
    const featuredMedia = readPath(post, ['_embedded', 'wp:featuredmedia']);
    const authorItems = readPath(post, ['_embedded', 'author']);
    const coverUrl =
      normalizeOptionalUrl(
        Array.isArray(featuredMedia) ? readPath(featuredMedia[0], ['source_url']) : '',
      ) ||
      normalizeOptionalUrl(readPath(post, ['jetpack_featured_media_url'])) ||
      null;
    const authorName = normalizeString(
      Array.isArray(authorItems) ? readPath(authorItems[0], ['name']) : '',
    );
    const publishedAtValue =
      normalizeString(readPath(post, ['date_gmt'])) || normalizeString(readPath(post, ['date']));
    const publishedAt = publishedAtValue ? new Date(publishedAtValue) : null;

    return this.upsertImportedContent(
      {
        title,
        excerpt,
        content: contentHtml,
        coverUrl,
        authorName,
        sourceType: 'wordpress',
        sourceId: String(post.id),
        sourceUrl:
          normalizeOptionalUrl(normalizeString(readPath(post, ['link'])) || input.postUrl) ??
          `${siteUrl}/?p=${post.id}`,
        publishedAt,
        meta: {
          wordpress: {
            siteUrl,
            slug: normalizeString(readPath(post, ['slug'])) || urlSlug,
            status: normalizeString(readPath(post, ['status'])) || null,
          },
        },
      },
      input.status,
    );
  }

  private async requestNotion(
    path: string,
    apiToken: string,
    init?: RequestInit,
    version = NOTION_BLOCK_API_VERSION,
  ) {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${apiToken}`);
    headers.set('Notion-Version', version);
    headers.set('Content-Type', 'application/json');

    const response = await fetch(`https://api.notion.com/v1${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await response.json().catch(() => null)) as unknown;
    return { response, data };
  }

  private async fetchNotionMarkdown(pageId: string, apiToken: string) {
    const { response, data } = await this.requestNotion(
      `/pages/${pageId}/markdown`,
      apiToken,
      undefined,
      NOTION_MARKDOWN_API_VERSION,
    );

    if (!response.ok) {
      return {
        ok: false as const,
        message: formatNotionError(response, data),
      };
    }

    const dataRecord = isRecord(data) ? data : {};
    if (typeof dataRecord.markdown !== 'string') {
      return {
        ok: false as const,
        message: 'Notion markdown 接口没有返回正文内容',
      };
    }

    const unknownBlockIds = Array.isArray(dataRecord.unknown_block_ids)
      ? dataRecord.unknown_block_ids.map(normalizeString).filter((id) => id.length > 0)
      : [];

    return {
      ok: true as const,
      html: markdownToHtml(dataRecord.markdown),
      truncated: dataRecord.truncated === true,
      unknownBlockIds,
    };
  }

  private async fetchNotionBlockTree(blockId: string, apiToken: string): Promise<NotionBlock[]> {
    let hasMore = true;
    let cursor = '';
    const blocks: NotionBlock[] = [];

    while (hasMore) {
      const query = cursor
        ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
        : '?page_size=100';
      const { response, data } = await this.requestNotion(
        `/blocks/${blockId}/children${query}`,
        apiToken,
      );
      if (!response.ok) {
        throw httpError(502, `读取 Notion 内容失败：${formatNotionError(response, data)}`);
      }

      const dataRecord = isRecord(data) ? data : {};
      const results = toNotionBlocks(dataRecord.results);
      for (const block of results) {
        if (block.has_children && block.id) {
          block.children = await this.fetchNotionBlockTree(block.id, apiToken);
        }
        blocks.push(block);
      }

      hasMore = dataRecord.has_more === true;
      cursor = normalizeString(dataRecord.next_cursor);
    }

    return blocks;
  }

  async importFromNotion(input: z.infer<typeof importNotionContentSchema>) {
    const pageId = extractNotionPageId(input);
    if (!pageId) throw httpError(422, '无效的 Notion 页面标识');
    const apiToken = normalizeString(input.apiToken);
    if (!apiToken) throw httpError(422, 'Notion API Token 未配置');

    const { response, data } = await this.requestNotion(`/pages/${pageId}`, apiToken);
    if (!response.ok) {
      throw httpError(502, `Notion 导入失败：${formatNotionError(response, data)}`);
    }

    const dataRecord = isRecord(data) ? data : {};
    const properties = isRecord(dataRecord.properties) ? dataRecord.properties : {};
    const titleProperty = Object.values(properties).find(
      (property) => isRecord(property) && property.type === 'title',
    );
    const titleRichText =
      isRecord(titleProperty) && Array.isArray(titleProperty.title)
        ? (titleProperty.title as NotionRichText[])
        : undefined;
    const title = stripHtml(renderNotionRichText(titleRichText)) || 'Untitled';
    const markdownResult = await this.fetchNotionMarkdown(pageId, apiToken);
    let contentHtml: string;
    let importApi: 'markdown' | 'blocks';
    let markdownMeta: Record<string, unknown> | null = null;

    if (markdownResult.ok) {
      contentHtml = markdownResult.html;
      importApi = 'markdown';
      markdownMeta = {
        apiVersion: NOTION_MARKDOWN_API_VERSION,
        truncated: markdownResult.truncated,
        unknownBlockIds: markdownResult.unknownBlockIds,
      };
    } else {
      const blocks = await this.fetchNotionBlockTree(pageId, apiToken);
      contentHtml = renderNotionBlocks(blocks);
      importApi = 'blocks';
      markdownMeta = {
        apiVersion: NOTION_MARKDOWN_API_VERSION,
        fallbackReason: markdownResult.message,
      };
    }

    const excerpt = buildExcerpt(contentHtml, title);
    const coverUrl =
      normalizeOptionalUrl(readPath(dataRecord, ['cover', 'external', 'url'])) ||
      normalizeOptionalUrl(readPath(dataRecord, ['cover', 'file', 'url'])) ||
      null;
    const authorName = normalizeString(readPath(dataRecord, ['created_by', 'name']));
    const lastEditedTime = normalizeString(dataRecord.last_edited_time);
    const publishedAt = lastEditedTime ? new Date(lastEditedTime) : null;

    return this.upsertImportedContent(
      {
        title,
        excerpt,
        content: contentHtml,
        coverUrl,
        authorName,
        sourceType: 'notion',
        sourceId: pageId,
        sourceUrl: normalizeOptionalUrl(input.pageUrl) ?? normalizeOptionalUrl(dataRecord.url),
        publishedAt,
        meta: {
          notion: {
            pageId,
            lastEditedTime: lastEditedTime || null,
            importApi,
            blockApiVersion: NOTION_BLOCK_API_VERSION,
            markdown: markdownMeta,
          },
        },
      },
      input.status,
    );
  }

  async importFromWechat(input: z.infer<typeof importWechatContentSchema>) {
    const response = await fetch(input.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw httpError(502, `微信公众号文章抓取失败：${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const title =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('#activity-name').text().trim() ||
      'Untitled';
    const description =
      $('meta[property="og:description"]').attr('content')?.trim() ||
      $('#meta_content').text().trim() ||
      '';
    const authorName =
      $('#js_name').text().trim() || $('meta[name="author"]').attr('content')?.trim() || '';
    const coverUrl = normalizeOptionalUrl($('meta[property="og:image"]').attr('content'));
    const contentElement = $('#js_content');

    contentElement.find('img').each((_, element) => {
      const image = $(element);
      const bestUrl = image.attr('data-src') || image.attr('src') || '';
      if (bestUrl) {
        image.attr('src', bestUrl);
      }
      image.removeAttr('data-src');
    });

    const contentHtml = contentElement.html()?.trim() || '';
    const excerpt = buildExcerpt(description || contentHtml, title);

    return this.upsertImportedContent(
      {
        title,
        excerpt,
        content: contentHtml,
        coverUrl,
        authorName,
        sourceType: 'wechat',
        sourceId: input.url,
        sourceUrl: input.url,
        publishedAt: new Date(),
        meta: {
          wechat: {
            importedFrom: input.url,
          },
        },
      },
      input.status,
    );
  }
}

export const contentModule: AppModule = {
  name: 'content',
  async register(app) {
    app.get('/public/stories', async (request) => {
      const query = contentListQuerySchema.parse(request.query);
      return new ContentService(app.db).listPublishedContent(query);
    });

    app.get('/public/stories/:slug', async (request) => {
      const params = publicContentSlugParamsSchema.parse(request.params);
      return new ContentService(app.db).getPublicContentBySlug(params.slug);
    });

    app.get('/public/content', async (request) => {
      const query = contentListQuerySchema.parse(request.query);
      return new ContentService(app.db).listPublishedContent(query);
    });

    app.get('/public/content/:slug', async (request) => {
      const params = publicContentSlugParamsSchema.parse(request.params);
      return new ContentService(app.db).getPublicContentBySlug(params.slug);
    });

    app.get('/v1/admin/content', { preHandler: app.requireAdmin }, async (request) => {
      const query = contentListQuerySchema.parse(request.query);
      return new ContentService(app.db).listContent(query);
    });

    app.get('/v1/admin/content/:contentId', { preHandler: app.requireAdmin }, async (request) => {
      const params = contentIdParamsSchema.parse(request.params);
      return new ContentService(app.db).getContentById(params.contentId);
    });

    app.post('/v1/admin/content', { preHandler: app.requireAdmin }, async (request, reply) => {
      const payload = upsertContentSchema.parse(request.body);
      const item = await new ContentService(app.db).upsertContent(null, payload);
      return reply.status(201).send(item);
    });

    app.patch('/v1/admin/content/:contentId', { preHandler: app.requireAdmin }, async (request) => {
      const params = contentIdParamsSchema.parse(request.params);
      const payload = upsertContentSchema.parse(request.body);
      return new ContentService(app.db).upsertContent(params.contentId, payload);
    });

    app.put('/v1/admin/content/:contentId', { preHandler: app.requireAdmin }, async (request) => {
      const params = contentIdParamsSchema.parse(request.params);
      const payload = upsertContentSchema.parse(request.body);
      return new ContentService(app.db).upsertContent(params.contentId, payload);
    });

    app.post(
      '/v1/admin/content/import/wordpress',
      { preHandler: app.requireAdmin },
      async (request, reply) => {
        const payload = importWordPressContentSchema.parse(request.body);
        const settings = await new ContentImportSettingsService(
          app.db,
          app.appEnv,
        ).resolveDraftSettings({
          wordpress: {
            siteUrl: payload.siteUrl,
            username: payload.username,
            appPassword: payload.appPassword,
          },
        });
        const item = await new ContentService(app.db).importFromWordPress({
          ...payload,
          siteUrl: settings.wordpress.siteUrl || payload.siteUrl,
          username: settings.wordpress.username,
          appPassword: settings.wordpress.appPassword,
        });
        return reply.status(201).send(item);
      },
    );

    app.post(
      '/v1/admin/content/import/notion',
      { preHandler: app.requireAdmin },
      async (request, reply) => {
        const payload = importNotionContentSchema.parse(request.body);
        const settings = await new ContentImportSettingsService(
          app.db,
          app.appEnv,
        ).resolveDraftSettings({
          notion: { apiToken: payload.apiToken },
        });
        if (!settings.notion.apiToken) {
          throw httpError(422, 'Notion API Token 未配置');
        }
        const item = await new ContentService(app.db).importFromNotion({
          ...payload,
          apiToken: settings.notion.apiToken || '',
        });
        return reply.status(201).send(item);
      },
    );

    app.post(
      '/v1/admin/content/import/wechat',
      { preHandler: app.requireAdmin },
      async (request, reply) => {
        const payload = importWechatContentSchema.parse(request.body);
        const item = await new ContentService(app.db).importFromWechat(payload);
        return reply.status(201).send(item);
      },
    );
  },
};
