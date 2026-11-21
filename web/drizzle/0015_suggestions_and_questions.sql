CREATE TYPE "public"."question_state" AS ENUM('open', 'yes', 'no', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."question_trigger" AS ENUM('recurring_requirement', 'thin_item', 'forgotten_category', 'job');--> statement-breakpoint
CREATE TYPE "public"."review_state" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."suggestion_kind" AS ENUM('vague', 'too_long', 'repetition', 'job_wording');--> statement-breakpoint
CREATE TYPE "public"."suggestion_state" AS ENUM('open', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "profile_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"topic" text NOT NULL,
	"question" text NOT NULL,
	"trigger" "question_trigger" NOT NULL,
	"profile_item_id" uuid,
	"job_id" uuid,
	"job_count" integer DEFAULT 0 NOT NULL,
	"state" "question_state" DEFAULT 'open' NOT NULL,
	"answer_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profile_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid,
	"state" "review_state" DEFAULT 'running' NOT NULL,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"profile_item_id" uuid NOT NULL,
	"job_id" uuid,
	"kind" "suggestion_kind" NOT NULL,
	"original_text" text NOT NULL,
	"proposed_text" text NOT NULL,
	"reason" text NOT NULL,
	"state" "suggestion_state" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "profile_questions" ADD CONSTRAINT "profile_questions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_questions" ADD CONSTRAINT "profile_questions_profile_item_id_profile_items_id_fk" FOREIGN KEY ("profile_item_id") REFERENCES "public"."profile_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_questions" ADD CONSTRAINT "profile_questions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_questions" ADD CONSTRAINT "profile_questions_answer_item_id_profile_items_id_fk" FOREIGN KEY ("answer_item_id") REFERENCES "public"."profile_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_reviews" ADD CONSTRAINT "profile_reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_reviews" ADD CONSTRAINT "profile_reviews_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_profile_item_id_profile_items_id_fk" FOREIGN KEY ("profile_item_id") REFERENCES "public"."profile_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_questions_user_state_idx" ON "profile_questions" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "suggestions_user_state_idx" ON "suggestions" USING btree ("user_id","state");