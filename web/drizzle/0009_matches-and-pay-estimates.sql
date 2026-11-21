CREATE TYPE "public"."certainty" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."firm_limit_result" AS ENUM('pass', 'fail');--> statement-breakpoint
CREATE TABLE "job_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"firm_limit_result" "firm_limit_result" NOT NULL,
	"failed_limits" text[] DEFAULT '{}' NOT NULL,
	"unknown_fields" text[] DEFAULT '{}' NOT NULL,
	"target_fit" integer,
	"target_fit_reason" text,
	"target_scored_at" timestamp with time zone,
	"profile_fit" integer,
	"profile_fit_reason" text,
	"profile_scored_at" timestamp with time zone,
	"dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "pay_estimate_min" double precision;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "pay_estimate_max" double precision;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "pay_estimate_period" "pay_period";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "pay_estimate_certainty" "certainty";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "pay_estimate_reason" text;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "found_by" text;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_target_id_job_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."job_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_matches_unique_idx" ON "job_matches" USING btree ("user_id","job_id","target_id");--> statement-breakpoint
CREATE INDEX "job_matches_user_idx" ON "job_matches" USING btree ("user_id","dismissed");