CREATE TYPE "public"."summary_rating_reason" AS ENUM('useful', 'too_generic', 'wrong', 'missed_something', 'too_long');--> statement-breakpoint
CREATE TABLE "match_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"headline" text NOT NULL,
	"points" jsonb NOT NULL,
	"prompt_version" text NOT NULL,
	"rating" text,
	"rating_reason" "summary_rating_reason",
	"rating_comment" text DEFAULT '' NOT NULL,
	"rated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "summaries_on" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "summary_score" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_summaries" ADD CONSTRAINT "match_summaries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_summaries" ADD CONSTRAINT "match_summaries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_summaries_user_job_idx" ON "match_summaries" USING btree ("user_id","job_id");