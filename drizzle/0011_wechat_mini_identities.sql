CREATE TABLE "account_wechat_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"app_id" varchar(80) NOT NULL,
	"openid" varchar(128) NOT NULL,
	"unionid" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_wechat_identities" ADD CONSTRAINT "account_wechat_identities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_wechat_identities_app_openid_idx" ON "account_wechat_identities" USING btree ("app_id","openid");--> statement-breakpoint
CREATE UNIQUE INDEX "account_wechat_identities_account_app_idx" ON "account_wechat_identities" USING btree ("account_id","app_id");