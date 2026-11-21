import { sql } from "drizzle-orm";
import { date, jsonb, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const runTrigger = pgEnum("run_trigger", ["schedule", "manual"]);
export const runStatus = pgEnum("run_status", ["running", "done", "failed"]);

/** One daily search across all sources. Scheduled runs are unique per Calgary date. */
export const dailyRuns = pgTable(
  "daily_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The Calgary calendar date the run belongs to. */
    runDate: date("run_date").notNull(),
    trigger: runTrigger("trigger").notNull(),
    status: runStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** Counts per source, for the admin dashboard. */
    summary: jsonb("summary"),
  },
  (table) => [
    uniqueIndex("daily_runs_scheduled_date_idx")
      .on(table.runDate)
      .where(sql`${table.trigger} = 'schedule'`),
  ],
);

export type DailyRun = typeof dailyRuns.$inferSelect;
