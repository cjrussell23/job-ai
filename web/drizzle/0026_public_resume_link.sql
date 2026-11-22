ALTER TABLE "documents" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_public_token_unique" UNIQUE("public_token");