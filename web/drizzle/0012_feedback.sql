CREATE TYPE "public"."feedback_kind" AS ENUM('up', 'down', 'dismissed', 'saved', 'applied');--> statement-breakpoint
CREATE TYPE "public"."feedback_reason" AS ENUM('pay', 'wrong_role', 'too_senior', 'location', 'company', 'other');--> statement-breakpoint
CREATE TYPE "public"."preference_origin" AS ENUM('feedback', 'member');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"target_id" uuid,
	"kind" "feedback_kind" NOT NULL,
	"reason" "feedback_reason",
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learned_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"statement" text NOT NULL,
	"origin" "preference_origin" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "preferences_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "preferences_learned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_target_id_job_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."job_targets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learned_preferences" ADD CONSTRAINT "learned_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_user_idx" ON "feedback" USING btree ("user_id","created_at");