ALTER TABLE "job_matches" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "discord_user_id" text;