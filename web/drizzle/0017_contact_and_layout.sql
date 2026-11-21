CREATE TABLE "profile_contacts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "layout" jsonb;--> statement-breakpoint
ALTER TABLE "profile_contacts" ADD CONSTRAINT "profile_contacts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;