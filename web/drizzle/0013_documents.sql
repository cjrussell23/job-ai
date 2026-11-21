CREATE TYPE "public"."document_kind" AS ENUM('resume', 'cover_letter');--> statement-breakpoint
CREATE TYPE "public"."document_state" AS ENUM('generating', 'draft', 'approved', 'failed');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid,
	"kind" "document_kind" NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"template" text DEFAULT 'clean' NOT NULL,
	"state" "document_state" DEFAULT 'generating' NOT NULL,
	"body" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"failure" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_user_job_idx" ON "documents" USING btree ("user_id","job_id");