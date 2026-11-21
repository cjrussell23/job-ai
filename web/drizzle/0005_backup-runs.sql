CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"filename" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL
);
