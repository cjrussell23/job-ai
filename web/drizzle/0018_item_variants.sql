ALTER TYPE "public"."profile_item_type" ADD VALUE 'summary';--> statement-breakpoint
ALTER TABLE "profile_items" ADD COLUMN "short_content" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_items" ADD COLUMN "alternate_titles" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_items" ADD COLUMN "url" text DEFAULT '' NOT NULL;