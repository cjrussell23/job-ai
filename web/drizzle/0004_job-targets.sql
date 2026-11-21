CREATE TYPE "public"."pay_basis" AS ENUM('hourly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."search_title_state" AS ENUM('none', 'proposing', 'proposed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."workplace" AS ENUM('remote_only', 'local_or_remote', 'local_only');--> statement-breakpoint
CREATE TABLE "job_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role_type" text NOT NULL,
	"search_titles" text[] DEFAULT '{}' NOT NULL,
	"proposed_search_titles" text[] DEFAULT '{}' NOT NULL,
	"search_title_state" "search_title_state" DEFAULT 'none' NOT NULL,
	"locations" text[] DEFAULT '{}' NOT NULL,
	"workplace" "workplace" DEFAULT 'local_or_remote' NOT NULL,
	"location_is_firm" boolean DEFAULT false NOT NULL,
	"hide_unknown_location" boolean DEFAULT false NOT NULL,
	"min_pay_cents" integer,
	"pay_basis" "pay_basis" DEFAULT 'annual' NOT NULL,
	"desired_hours" integer,
	"pay_is_firm" boolean DEFAULT false NOT NULL,
	"hide_unknown_pay" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_targets" ADD CONSTRAINT "job_targets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;