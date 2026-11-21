import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { type BackupRun, backupRuns } from "@/db/schema";

export type BackupStatus = {
  lastRun: BackupRun | undefined;
  lastSuccess: BackupRun | undefined;
  /** True when no backup has succeeded within the last 26 hours (a day plus slack). */
  overdue: boolean;
};

const overdueAfterMs = 26 * 60 * 60 * 1000;

export async function backupStatus(now: Date = new Date()): Promise<BackupStatus> {
  const [lastRun] = await db()
    .select()
    .from(backupRuns)
    .orderBy(desc(backupRuns.finishedAt))
    .limit(1);
  const [lastSuccess] = await db()
    .select()
    .from(backupRuns)
    .where(eq(backupRuns.ok, true))
    .orderBy(desc(backupRuns.finishedAt))
    .limit(1);
  const overdue = !lastSuccess || now.getTime() - lastSuccess.finishedAt.getTime() > overdueAfterMs;
  return { lastRun, lastSuccess, overdue };
}
