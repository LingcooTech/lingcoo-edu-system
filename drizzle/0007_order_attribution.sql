-- Carry acquisition attribution through checkout orders so reports can connect
-- campaign/channel spend to paid revenue.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source" varchar(80) NOT NULL DEFAULT 'unknown';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "channel_id" uuid;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "campaign_id" uuid;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "medium" varchar(40);

DO $$ BEGIN
  ALTER TABLE "orders"
    ADD CONSTRAINT "orders_channel_id_channels_id_fk"
    FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "orders"
    ADD CONSTRAINT "orders_campaign_id_campaigns_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "orders_channel_idx" ON "orders" ("channel_id");
CREATE INDEX IF NOT EXISTS "orders_campaign_idx" ON "orders" ("campaign_id");
