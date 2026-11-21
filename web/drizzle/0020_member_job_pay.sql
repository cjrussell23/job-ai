CREATE TYPE "public"."member_pay_source" AS ENUM('entered', 'confirmed_estimate');--> statement-breakpoint
CREATE TABLE "member_job_pay" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"pay_min" double precision NOT NULL,
	"pay_max" double precision NOT NULL,
	"pay_period" "pay_period" NOT NULL,
	"source" "member_pay_source" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_job_pay" ADD CONSTRAINT "member_job_pay_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_job_pay" ADD CONSTRAINT "member_job_pay_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_job_pay_user_job_idx" ON "member_job_pay" USING btree ("user_id","job_id");