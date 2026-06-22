CREATE TYPE "public"."order_cancel_reason" AS ENUM('user_cancel', 'system_cancel', 'admin_invalid', 'test_order', 'duplicate', 'other');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_reason" "order_cancel_reason";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_by_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_admin_id_accounts_id_fk" FOREIGN KEY ("cancelled_by_admin_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
