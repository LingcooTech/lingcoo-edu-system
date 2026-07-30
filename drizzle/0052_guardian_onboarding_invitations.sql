CREATE TABLE "guardian_onboarding_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"institution_id" uuid,
	"token_hash" varchar(64) NOT NULL,
	"created_by_account_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardian_onboarding_invitations" ADD CONSTRAINT "guardian_onboarding_invitations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "guardian_onboarding_invitations" ADD CONSTRAINT "guardian_onboarding_invitations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "guardian_onboarding_invitations" ADD CONSTRAINT "guardian_onboarding_invitations_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_onboarding_invitations_token_hash_idx" ON "guardian_onboarding_invitations" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "guardian_onboarding_invitations_student_idx" ON "guardian_onboarding_invitations" USING btree ("student_id","created_at");
--> statement-breakpoint
CREATE INDEX "guardian_onboarding_invitations_expires_idx" ON "guardian_onboarding_invitations" USING btree ("expires_at");
