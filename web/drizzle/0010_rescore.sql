CREATE TABLE "rescore_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "profile_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_targets" ADD COLUMN "scoring_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rescore_requests" ADD CONSTRAINT "rescore_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;