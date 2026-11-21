CREATE TYPE "public"."board_system" AS ENUM('greenhouse', 'lever', 'ashby');--> statement-breakpoint
CREATE TYPE "public"."watched_company_origin" AS ENUM('member', 'discovered');--> statement-breakpoint
CREATE TABLE "watched_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"system" "board_system" NOT NULL,
	"board_id" text NOT NULL,
	"origin" "watched_company_origin" NOT NULL,
	"added_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watched_companies" ADD CONSTRAINT "watched_companies_added_by_user_id_user_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "watched_companies_board_idx" ON "watched_companies" USING btree ("system","board_id");