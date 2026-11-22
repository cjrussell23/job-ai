ALTER TABLE "job_matches" ADD COLUMN "target_fit_pros" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_matches" ADD COLUMN "target_fit_cons" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_matches" ADD COLUMN "profile_fit_pros" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_matches" ADD COLUMN "profile_fit_cons" text[] DEFAULT '{}' NOT NULL;