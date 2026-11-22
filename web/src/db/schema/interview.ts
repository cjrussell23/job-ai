import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { jobs } from "./jobs";
import { profileItems } from "./profile";

export const interviewSetState = pgEnum("interview_set_state", ["generating", "ready", "failed"]);

/**
 * Practice questions for one member: a general set (no job) from their profile and
 * targets, or a set for one job they are tracking, from its posting.
 */
export const interviewSets = pgTable(
  "interview_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    state: interviewSetState("state").notNull().default("generating"),
    failure: text("failure"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("interview_sets_user_idx").on(table.userId)],
);

export const interviewCategory = pgEnum("interview_category", [
  "behavioural",
  "technical",
  "project",
  "motivation",
  "job",
]);

export const answerRatingState = pgEnum("answer_rating_state", [
  "none",
  "rating",
  "rated",
  "failed",
]);
export const proposalState = pgEnum("interview_proposal_state", ["open", "accepted", "rejected"]);

export type AnswerFeedback = { summary: string; strengths: string[]; improvements: string[] };
export type ProposedItem = {
  type: "story" | "bullet";
  /** The role or project a bullet belongs under. */
  parentId: string | null;
  title: string;
  content: string;
};

/** One practice question, the member's answer, and the AI's rating of it. */
export const interviewQuestions = pgTable(
  "interview_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    setId: uuid("set_id")
      .notNull()
      .references(() => interviewSets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    category: interviewCategory("category").notNull(),
    question: text("question").notNull(),
    /** What a good answer shows, so the member knows what the interviewer is after. */
    lookingFor: text("looking_for").notNull().default(""),
    answer: text("answer").notNull().default(""),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    ratingState: answerRatingState("rating_state").notNull().default("none"),
    score: integer("score"),
    feedback: jsonb("feedback").$type<AnswerFeedback>(),
    /** The answer the rating was for; a later edit makes the rating out of date. */
    ratedAnswer: text("rated_answer"),
    ratedAt: timestamp("rated_at", { withTimezone: true }),
    /** A profile item built from the member's own answer, offered as accept or reject. */
    proposal: jsonb("proposal").$type<ProposedItem>(),
    proposalState: proposalState("proposal_state"),
    proposalItemId: uuid("proposal_item_id").references(() => profileItems.id, {
      onDelete: "set null",
    }),
  },
  (table) => [index("interview_questions_set_idx").on(table.setId, table.position)],
);

export type InterviewSet = typeof interviewSets.$inferSelect;
export type InterviewQuestion = typeof interviewQuestions.$inferSelect;
