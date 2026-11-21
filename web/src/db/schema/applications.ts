import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { documents } from "./documents";
import { jobs } from "./jobs";

export const applicationStatus = pgEnum("application_status", [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
]);

/** How an application reaches the employer. Only manual exists until auto-apply. */
export const submissionMethod = pgEnum("submission_method", ["manual"]);

/** Whether the member has signed off on sending; manual applications are the member's own act. */
export const approvalState = pgEnum("approval_state", ["not_required", "pending", "approved"]);

/** A member's pursuit of one job. Exists only once they save or apply (CLAUDE.md rule 11). */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: applicationStatus("status").notNull(),
    /** Approved documents only (rule 6); cleared if the document is deleted. */
    resumeId: uuid("resume_id").references(() => documents.id, { onDelete: "set null" }),
    coverLetterId: uuid("cover_letter_id").references(() => documents.id, { onDelete: "set null" }),
    submissionMethod: submissionMethod("submission_method").notNull().default("manual"),
    approvalState: approvalState("approval_state").notNull().default("not_required"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("applications_user_job_idx").on(table.userId, table.jobId),
    index("applications_user_status_idx").on(table.userId, table.status),
  ],
);

export type Application = typeof applications.$inferSelect;

/** Each status an application has had, with when, so the board can show dates. */
export const applicationEvents = pgTable("application_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  status: applicationStatus("status").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export type ApplicationEvent = typeof applicationEvents.$inferSelect;
