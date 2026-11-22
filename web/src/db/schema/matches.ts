import {
  boolean,
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
import { jobs } from "./jobs";
import { jobTargets } from "./targets";

export const firmLimitResult = pgEnum("firm_limit_result", ["pass", "fail"]);

/** The app's assessment of one job against one of a user's job targets. */
export const jobMatches = pgTable(
  "job_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => jobTargets.id, { onDelete: "cascade" }),
    firmLimitResult: firmLimitResult("firm_limit_result").notNull(),
    /** Firm limits the job failed, e.g. ["pay"]. */
    failedLimits: text("failed_limits").array().notNull().default([]),
    /** Firm-limited fields the postings do not state, shown as unknown. */
    unknownFields: text("unknown_fields").array().notNull().default([]),
    targetFit: integer("target_fit"),
    targetFitReason: text("target_fit_reason"),
    /** What suits the member about the job, and what may not; empty on older scores. */
    targetFitPros: text("target_fit_pros").array().notNull().default([]),
    targetFitCons: text("target_fit_cons").array().notNull().default([]),
    targetScoredAt: timestamp("target_scored_at", { withTimezone: true }),
    profileFit: integer("profile_fit"),
    profileFitReason: text("profile_fit_reason"),
    /** Where the member's profile meets the job, and where it falls short. */
    profileFitPros: text("profile_fit_pros").array().notNull().default([]),
    profileFitCons: text("profile_fit_cons").array().notNull().default([]),
    profileScoredAt: timestamp("profile_scored_at", { withTimezone: true }),
    dismissed: boolean("dismissed").notNull().default(false),
    /** When the member was told about this match, so it is never sent twice. */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("job_matches_unique_idx").on(table.userId, table.jobId, table.targetId),
    index("job_matches_user_idx").on(table.userId, table.dismissed),
  ],
);

export type JobMatch = typeof jobMatches.$inferSelect;

/** Each use of the rescore button, for the admin's daily limit. */
export const rescoreRequests = pgTable("rescore_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const summaryRatingReason = pgEnum("summary_rating_reason", [
  "useful",
  "too_generic",
  "wrong",
  "missed_something",
  "too_long",
]);

/**
 * A short AI read of one job for one member: what matters to them about it. Made for
 * strong matches only, and rated by the member so later summaries improve.
 */
export const matchSummaries = pgTable(
  "match_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    headline: text("headline").notNull(),
    /** `{ kind: "plus" | "watch" | "check", text }`: good for them, a concern, something to ask. */
    points: jsonb("points").$type<{ kind: "plus" | "watch" | "check"; text: string }[]>().notNull(),
    promptVersion: text("prompt_version").notNull(),
    rating: text("rating").$type<"up" | "down">(),
    ratingReason: summaryRatingReason("rating_reason"),
    ratingComment: text("rating_comment").notNull().default(""),
    ratedAt: timestamp("rated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("match_summaries_user_job_idx").on(table.userId, table.jobId)],
);

export type MatchSummary = typeof matchSummaries.$inferSelect;
