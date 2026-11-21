CREATE TYPE "public"."run_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('schedule', 'manual');--> statement-breakpoint
CREATE TABLE "daily_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_date" date NOT NULL,
	"trigger" "run_trigger" NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX "daily_runs_scheduled_date_idx" ON "daily_runs" USING btree ("run_date") WHERE "daily_runs"."trigger" = 'schedule';