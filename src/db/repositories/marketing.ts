import { desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export type Channel = typeof schema.channels.$inferSelect;
export type NewChannel = typeof schema.channels.$inferInsert;
export type Campaign = typeof schema.campaigns.$inferSelect;
export type NewCampaign = typeof schema.campaigns.$inferInsert;

// --- Channels (渠道) ---

export async function listChannels(db: Database) {
  return db.select().from(schema.channels).orderBy(desc(schema.channels.createdAt));
}

export async function createChannel(db: Database, values: NewChannel) {
  const [channel] = await db.insert(schema.channels).values(values).returning();
  return channel;
}

export async function updateChannel(db: Database, channelId: string, patch: Partial<NewChannel>) {
  const [channel] = await db
    .update(schema.channels)
    .set(patch)
    .where(eq(schema.channels.id, channelId))
    .returning();
  return channel ?? null;
}

export async function findChannelByCode(db: Database, code: string) {
  const [channel] = await db
    .select()
    .from(schema.channels)
    .where(eq(schema.channels.code, code))
    .limit(1);
  return channel ?? null;
}

export async function findChannel(db: Database, channelId: string) {
  const [channel] = await db
    .select()
    .from(schema.channels)
    .where(eq(schema.channels.id, channelId))
    .limit(1);
  return channel ?? null;
}

// --- Campaigns (活动) ---

export async function listCampaigns(db: Database) {
  return db.select().from(schema.campaigns).orderBy(desc(schema.campaigns.createdAt));
}

export async function createCampaign(db: Database, values: NewCampaign) {
  const [campaign] = await db.insert(schema.campaigns).values(values).returning();
  return campaign;
}

export async function updateCampaign(
  db: Database,
  campaignId: string,
  patch: Partial<NewCampaign>,
) {
  const [campaign] = await db
    .update(schema.campaigns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.campaigns.id, campaignId))
    .returning();
  return campaign ?? null;
}

export async function requireCampaign(db: Database, campaignId: string) {
  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, campaignId))
    .limit(1);
  if (!campaign) {
    throw notFound('Campaign not found');
  }
  return campaign;
}

export async function findCampaignByCode(db: Database, code: string) {
  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.code, code))
    .limit(1);
  return campaign ?? null;
}

/**
 * Resolves free-text attribution params (channel code + campaign code) from a
 * public registration into concrete channel/campaign FKs. The campaign's own
 * channel wins; otherwise we fall back to matching the source string to a
 * channel code. Unknown codes resolve to null (we still keep the raw source).
 */
export async function resolveAttribution(
  db: Database,
  input: { source?: string | null; campaignCode?: string | null },
): Promise<{ channelId: string | null; campaignId: string | null }> {
  const campaign = input.campaignCode ? await findCampaignByCode(db, input.campaignCode) : null;

  let channelId = campaign?.channelId ?? null;
  if (!channelId && input.source) {
    const channel = await findChannelByCode(db, input.source);
    channelId = channel?.id ?? null;
  }

  return { channelId, campaignId: campaign?.id ?? null };
}
