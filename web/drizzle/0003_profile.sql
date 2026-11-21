CREATE TYPE "public"."profile_item_source" AS ENUM('upload', 'manual', 'question', 'tailored_document');--> statement-breakpoint
CREATE TYPE "public"."profile_item_type" AS ENUM('role', 'bullet', 'project', 'skill', 'certification', 'story', 'note');--> statement-breakpoint
CREATE TYPE "public"."profile_item_visibility" AS ENUM('auto', 'always', 'never', 'cover_letter_only');--> statement-breakpoint
CREATE TYPE "public"."resume_upload_state" AS ENUM('parsing', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "profile_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" "profile_item_type" NOT NULL,
	"parent_id" uuid,
	"title" text DEFAULT '' NOT NULL,
	"organization" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"start_date" text DEFAULT '' NOT NULL,
	"end_date" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"visibility" "profile_item_visibility" DEFAULT 'auto' NOT NULL,
	"source" "profile_item_source" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"filename" text NOT NULL,
	"text" text NOT NULL,
	"state" "resume_upload_state" DEFAULT 'parsing' NOT NULL,
	"failure" text,
	"items_created" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_items" ADD CONSTRAINT "profile_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_items" ADD CONSTRAINT "profile_items_parent_id_profile_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."profile_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_uploads" ADD CONSTRAINT "resume_uploads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_items_user_idx" ON "profile_items" USING btree ("user_id","type","position");