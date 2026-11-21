import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { jobs } from "./jobs";
import { profileItems } from "./profile";

export const suggestionKind = pgEnum("suggestion_kind", [
  "vague",
  "too_long",
  "repetition",
  "job_wording",
]);
export const suggestionState = pgEnum("suggestion_state", ["open", "accepted", "rejected"]);

/** A proposed rewording of one profile item's text, which the member accepts or rejects (rule 3). */
export const suggestions = pgTable(
  "suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    profileItemId: uuid("profile_item_id")
      .notNull()
      .references(() => profileItems.id, { onDelete: "cascade" }),
    /** Set for job-specific suggestions. */
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    kind: suggestionKind("kind").notNull(),
    /** The item's text when suggested, so an item edited since isn't overwritten. */
    originalText: text("original_text").notNull(),
    proposedText: text("proposed_text").notNull(),
    reason: text("reason").notNull(),
    state: suggestionState("state").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [index("suggestions_user_state_idx").on(table.userId, table.state)],
);

export type Suggestion = typeof suggestions.$inferSelect;

export const questionTrigger = pgEnum("question_trigger", [
  "recurring_requirement",
  "thin_item",
  "forgotten_category",
  "job",
]);
export const questionState = pgEnum("question_state", ["open", "yes", "no", "skipped"]);

/** A neutral question about experience the profile doesn't show. A "no" is kept for good (rule 2). */
export const profileQuestions = pgTable(
  "profile_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Short name of what is asked about, e.g. "Power BI"; used to avoid asking twice. */
    topic: text("topic").notNull(),
    question: text("question").notNull(),
    trigger: questionTrigger("trigger").notNull(),
    /** The thin item a question asks about, if any. */
    profileItemId: uuid("profile_item_id").references(() => profileItems.id, {
      onDelete: "set null",
    }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    /** How many of the member's matches mention it, for recurring requirements. */
    jobCount: integer("job_count").notNull().default(0),
    state: questionState("state").notNull().default("open"),
    /** The item saved from a "yes" answer's example. */
    answerItemId: uuid("answer_item_id").references(() => profileItems.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (table) => [index("profile_questions_user_state_idx").on(table.userId, table.state)],
);

export type ProfileQuestion = typeof profileQuestions.$inferSelect;

export const reviewState = pgEnum("review_state", ["running", "done", "failed"]);

/** One requested profile review, general or for one job, so the page can show progress. */
export const profileReviews = pgTable("profile_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  state: reviewState("state").notNull().default("running"),
  failure: text("failure"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProfileReview = typeof profileReviews.$inferSelect;
