CREATE TYPE "public"."answer_rating_state" AS ENUM('none', 'rating', 'rated', 'failed');--> statement-breakpoint
CREATE TYPE "public"."interview_category" AS ENUM('behavioural', 'technical', 'project', 'motivation', 'job');--> statement-breakpoint
CREATE TYPE "public"."interview_set_state" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."interview_proposal_state" AS ENUM('open', 'accepted', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."profile_item_source" ADD VALUE 'interview';--> statement-breakpoint
CREATE TABLE "interview_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	"category" "interview_category" NOT NULL,
	"question" text NOT NULL,
	"looking_for" text DEFAULT '' NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"answered_at" timestamp with time zone,
	"rating_state" "answer_rating_state" DEFAULT 'none' NOT NULL,
	"score" integer,
	"feedback" jsonb,
	"rated_answer" text,
	"rated_at" timestamp with time zone,
	"proposal" jsonb,
	"proposal_state" "interview_proposal_state",
	"proposal_item_id" uuid
);
--> statement-breakpoint
CREATE TABLE "interview_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid,
	"state" "interview_set_state" DEFAULT 'generating' NOT NULL,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_set_id_interview_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."interview_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_proposal_item_id_profile_items_id_fk" FOREIGN KEY ("proposal_item_id") REFERENCES "public"."profile_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sets" ADD CONSTRAINT "interview_sets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sets" ADD CONSTRAINT "interview_sets_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_questions_set_idx" ON "interview_questions" USING btree ("set_id","position");--> statement-breakpoint
CREATE INDEX "interview_sets_user_idx" ON "interview_sets" USING btree ("user_id");