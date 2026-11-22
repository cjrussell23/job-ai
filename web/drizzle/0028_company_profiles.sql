CREATE TABLE "company_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_key" text NOT NULL,
	"company_name" text NOT NULL,
	"facts" jsonb,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_profiles_company_key_unique" UNIQUE("company_key")
);
