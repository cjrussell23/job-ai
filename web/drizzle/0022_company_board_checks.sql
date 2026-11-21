CREATE TYPE "public"."board_check_status" AS ENUM('found', 'not_found');--> statement-breakpoint
CREATE TABLE "company_board_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_key" text NOT NULL,
	"company_name" text NOT NULL,
	"status" "board_check_status" NOT NULL,
	"system" "board_system",
	"board_id" text,
	"open_jobs" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_board_checks_company_key_unique" UNIQUE("company_key")
);
