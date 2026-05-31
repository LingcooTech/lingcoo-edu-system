import { desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export type NewLead = typeof schema.leads.$inferInsert;
export type Lead = typeof schema.leads.$inferSelect;
export type FollowUp = typeof schema.followUpRecords.$inferSelect;
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

export async function requireActiveCampaignByCode(db: Database, code: string) {
  const campaign = await findCampaignByCode(db, code);
  if (!campaign) {
    throw notFound('Campaign not found');
  }
  if (campaign.status !== 'active') {
    throw Object.assign(new Error('Campaign is not active'), { statusCode: 422 });
  }
  return campaign;
}

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

// --- Leads (线索) ---

export async function listLeads(db: Database) {
  return db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt));
}

export async function createLead(db: Database, values: NewLead) {
  const [lead] = await db.insert(schema.leads).values(values).returning();
  return lead;
}

export async function requireLead(db: Database, leadId: string) {
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).limit(1);
  if (!lead) {
    throw notFound('Lead not found');
  }
  return lead;
}

export async function updateLead(
  db: Database,
  leadId: string,
  patch: Partial<typeof schema.leads.$inferInsert>,
) {
  const [lead] = await db
    .update(schema.leads)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.leads.id, leadId))
    .returning();
  return lead;
}

export async function addFollowUp(
  db: Database,
  values: typeof schema.followUpRecords.$inferInsert,
) {
  const [record] = await db.insert(schema.followUpRecords).values(values).returning();
  return record;
}

export async function listFollowUps(db: Database, leadId: string) {
  return db
    .select()
    .from(schema.followUpRecords)
    .where(eq(schema.followUpRecords.leadId, leadId))
    .orderBy(desc(schema.followUpRecords.createdAt));
}
