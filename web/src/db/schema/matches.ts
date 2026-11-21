import {
  boolean,
  index,
  integer,
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
    targetScoredAt: timestamp("target_scored_at", { withTimezone: true }),
    profileFit: integer("profile_fit"),
    profileFitReason: text("profile_fit_reason"),
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
