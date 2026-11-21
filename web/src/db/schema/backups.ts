import { bigint, boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** One row per backup attempt, written by the backup container. */
export const backupRuns = pgTable("backup_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
  ok: boolean("ok").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
  filename: text("filename").notNull().default(""),
  message: text("message").notNull().default(""),
});

export type BackupRun = typeof backupRuns.$inferSelect;
