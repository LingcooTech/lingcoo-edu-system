CREATE TYPE "public"."refund_request_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."refund_reason" AS ENUM('schedule_conflict', 'course_not_fit', 'duplicate_payment', 'service_issue', 'other');--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"account_id" uuid,
	"amount" integer NOT NULL,
	"reason" "refund_reason" NOT NULL,
	"status" "refund_request_status" DEFAULT 'pending' NOT NULL,
	"buyer_note" text,
	"admin_note" text,
	"decided_by_account_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_decided_by_account_id_accounts_id_fk" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refund_requests_order_idx" ON "refund_requests" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refund_requests_order_no_idx" ON "refund_requests" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "refund_requests_account_idx" ON "refund_requests" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "refund_requests_status_idx" ON "refund_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "refund_requests_open_order_idx" ON "refund_requests" USING btree ("order_id") WHERE "status" = 'pending';
