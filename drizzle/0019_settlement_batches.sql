CREATE TYPE "public"."settlement_batch_status" AS ENUM('settled', 'voided');--> statement-breakpoint
CREATE TABLE "settlement_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_receiver_type" "payment_receiver_type" DEFAULT 'platform' NOT NULL,
	"payment_receiver_institution_id" uuid,
	"payment_receiver_name" varchar(160) NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"order_count" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"status" "settlement_batch_status" DEFAULT 'settled' NOT NULL,
	"note" text,
	"created_by_account_id" uuid,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_batch_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_batch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settlement_batches" ADD CONSTRAINT "settlement_batches_payment_receiver_institution_id_institutions_id_fk" FOREIGN KEY ("payment_receiver_institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_batches" ADD CONSTRAINT "settlement_batches_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_batch_orders" ADD CONSTRAINT "settlement_batch_orders_settlement_batch_id_settlement_batches_id_fk" FOREIGN KEY ("settlement_batch_id") REFERENCES "public"."settlement_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_batch_orders" ADD CONSTRAINT "settlement_batch_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "settlement_batches_receiver_idx" ON "settlement_batches" USING btree ("payment_receiver_type","payment_receiver_institution_id","payment_receiver_name");--> statement-breakpoint
CREATE INDEX "settlement_batches_status_idx" ON "settlement_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "settlement_batches_settled_at_idx" ON "settlement_batches" USING btree ("settled_at");--> statement-breakpoint
CREATE INDEX "settlement_batch_orders_batch_idx" ON "settlement_batch_orders" USING btree ("settlement_batch_id");--> statement-breakpoint
CREATE INDEX "settlement_batch_orders_order_idx" ON "settlement_batch_orders" USING btree ("order_id");
