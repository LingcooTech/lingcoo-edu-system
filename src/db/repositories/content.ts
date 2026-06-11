import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export type ContentSourceType = 'manual' | 'wordpress' | 'notion' | 'wechat';
export type ContentStatus = 'draft' | 'published' | 'archived';
export type ContentItem = typeof schema.contentItems.$inferSelect;
export type NewContentItem = typeof schema.contentItems.$inferInsert;

export interface ContentListQuery {
  limit: number;
  offset: number;
  search?: string;
  status?: ContentStatus;
  sourceType?: ContentSourceType;
}

export async function findContentById(db: Database, id: string) {
  const [item] = await db
    .select()
    .from(schema.contentItems)
    .where(eq(schema.contentItems.id, id))
    .limit(1);
  return item ?? null;
}

export async function findContentBySlug(db: Database, slug: string) {
  const [item] = await db
    .select()
    .from(schema.contentItems)
    .where(eq(schema.contentItems.slug, slug))
    .limit(1);
  return item ?? null;
}

export async function findContentBySource(
  db: Database,
  input: { sourceType: ContentSourceType; sourceId?: string | null; sourceUrl?: string | null },
) {
  if (input.sourceId?.trim()) {
    const [item] = await db
      .select()
      .from(schema.contentItems)
      .where(
        and(
          eq(schema.contentItems.sourceType, input.sourceType),
          eq(schema.contentItems.sourceId, input.sourceId.trim()),
        ),
      )
      .limit(1);
    if (item) return item;
  }

  if (input.sourceUrl?.trim()) {
    const [item] = await db
      .select()
      .from(schema.contentItems)
      .where(
        and(
          eq(schema.contentItems.sourceType, input.sourceType),
          eq(schema.contentItems.sourceUrl, input.sourceUrl.trim()),
        ),
      )
      .limit(1);
    return item ?? null;
  }

  return null;
}

export async function listContent(db: Database, query: ContentListQuery) {
  const conditions = [];

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(
        ilike(schema.contentItems.title, pattern),
        ilike(schema.contentItems.slug, pattern),
        ilike(schema.contentItems.excerpt, pattern),
        ilike(schema.contentItems.authorName, pattern),
        ilike(schema.contentItems.sourceUrl, pattern),
      )!,
    );
  }

  if (query.status) {
    conditions.push(eq(schema.contentItems.status, query.status));
  }

  if (query.sourceType) {
    conditions.push(eq(schema.contentItems.sourceType, query.sourceType));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(schema.contentItems)
      .where(where)
      .orderBy(
        desc(schema.contentItems.publishedAt),
        desc(schema.contentItems.importedAt),
        desc(schema.contentItems.createdAt),
      )
      .limit(query.limit)
      .offset(query.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.contentItems)
      .where(where),
  ]);

  return {
    items,
    total: countResult[0]?.count ?? 0,
  };
}

export async function listPublishedContent(
  db: Database,
  query: { limit: number; offset: number; search?: string },
) {
  const conditions = [eq(schema.contentItems.status, 'published' as const)];

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(
        ilike(schema.contentItems.title, pattern),
        ilike(schema.contentItems.slug, pattern),
        ilike(schema.contentItems.excerpt, pattern),
        ilike(schema.contentItems.authorName, pattern),
      )!,
    );
  }

  const where = and(...conditions);
  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(schema.contentItems)
      .where(where)
      .orderBy(desc(schema.contentItems.publishedAt), desc(schema.contentItems.updatedAt))
      .limit(query.limit)
      .offset(query.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.contentItems)
      .where(where),
  ]);

  return {
    items,
    total: countResult[0]?.count ?? 0,
  };
}

export async function createContent(db: Database, input: NewContentItem) {
  const [item] = await db.insert(schema.contentItems).values(input).returning();
  return item;
}

export async function updateContent(db: Database, id: string, input: Partial<NewContentItem>) {
  const [item] = await db
    .update(schema.contentItems)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(schema.contentItems.id, id))
    .returning();

  return item ?? null;
}
