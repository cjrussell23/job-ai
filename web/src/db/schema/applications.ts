import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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

/**
 * How an application reaches the employer: sent by the member themselves, or filled in
 * by autofill in their browser and then submitted by them (ADR 0005).
 */
export const submissionMethod = pgEnum("submission_method", ["manual", "assisted"]);

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

/** A member's answers to questions most application forms ask (ADR 0005). */
export type StandardAnswers = {
  /** Legally able to work in Canada. Null leaves the question for the member. */
  workAuthorized: boolean | null;
  needsSponsorship: boolean | null;
  willingToRelocate: boolean | null;
  /** Free text such as "Two weeks" or "Immediately". */
  noticePeriod: string;
  /** Free text such as "$110,000"; blank leaves salary questions for the member. */
  salaryExpectation: string;
  howHeard: string;
  pronouns: string;
  /** Self-identification answers; blank means "prefer not to say". */
  gender: string;
  ethnicity: string;
  veteran: string;
  disability: string;
};

export const standardAnswers = pgTable("standard_answers", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  answers: jsonb("answers").$type<StandardAnswers>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A member's answer to one form question, reused when the same question comes up again. */
export const savedAnswers = pgTable(
  "saved_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The question normalized, so small wording differences still match. */
    questionKey: text("question_key").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("saved_answers_user_question_idx").on(table.userId, table.questionKey)],
);

export type SavedAnswer = typeof savedAnswers.$inferSelect;

export const answersState = pgEnum("apply_answers_state", ["none", "working", "ready", "failed"]);

export type FormQuestion = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "select" | "radio" | "checkbox";
  options: string[];
  required: boolean;
};
export type DraftedAnswer = {
  key: string;
  /** Null when the profile doesn't answer it: the member fills it in. */
  answer: string | null;
  /** Profile item ids the answer came from (rule 1). */
  sourceIds: string[];
};

/**
 * One use of autofill for one application (ADR 0005). The extension proves it may read
 * the application's packet with a random ticket, of which only the hash is kept.
 */
export const applySessions = pgTable(
  "apply_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    ticketHash: text("ticket_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** The questions the extension couldn't fill itself, and the model's answers. */
    questions: jsonb("questions").$type<FormQuestion[]>().notNull().default([]),
    answers: jsonb("answers").$type<DraftedAnswer[]>().notNull().default([]),
    answersState: answersState("answers_state").notNull().default("none"),
    filledCount: integer("filled_count").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("apply_sessions_user_idx").on(table.userId)],
);

export type ApplySession = typeof applySessions.$inferSelect;
