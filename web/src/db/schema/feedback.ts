import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { jobs } from "./jobs";
import { jobTargets } from "./targets";

export const feedbackKind = pgEnum("feedback_kind", [
  "up",
  "down",
  "dismissed",
  "saved",
  "applied",
]);
export const feedbackReason = pgEnum("feedback_reason", [
  "pay",
  "wrong_role",
  "too_senior",
  "location",
  "company",
  "other",
]);

/** A member's signal about a job: a grade, or an action that says something about fit. */
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    /** The target the job was shown for; null when the target was later deleted. */
    targetId: uuid("target_id").references(() => jobTargets.id, { onDelete: "set null" }),
    kind: feedbackKind("kind").notNull(),
    reason: feedbackReason("reason"),
    comment: text("comment").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("feedback_user_idx").on(table.userId, table.createdAt)],
);

export type Feedback = typeof feedback.$inferSelect;

export const preferenceOrigin = pgEnum("preference_origin", ["feedback", "member"]);

/** A short statement of what a member likes or avoids, learned from feedback or written by them. */
export const learnedPreferences = pgTable("learned_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  statement: text("statement").notNull(),
  origin: preferenceOrigin("origin").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LearnedPreference = typeof learnedPreferences.$inferSelect;
