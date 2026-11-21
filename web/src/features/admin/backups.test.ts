import { afterAll, beforeEach, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { backupRuns } from "@/db/schema";
import { resetDb } from "@/test/db";
import { backupStatus } from "./backups";

beforeEach(resetDb);
afterAll(closeDb);

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

async function addRun(ok: boolean, finishedHoursAgo: number) {
  const finishedAt = hoursAgo(finishedHoursAgo);
  await db()
    .insert(backupRuns)
    .values({ ok, startedAt: finishedAt, finishedAt, sizeBytes: ok ? 1000 : 0 });
}

test("no backups at all is overdue", async () => {
  expect((await backupStatus()).overdue).toBe(true);
});

test("a success within the last day is fine, even after a later failure", async () => {
  await addRun(true, 20);
  await addRun(false, 1);
  const status = await backupStatus();
  expect(status.overdue).toBe(false);
  expect(status.lastRun?.ok).toBe(false);
  expect(status.lastSuccess?.ok).toBe(true);
});

test("a last success over 26 hours ago is overdue", async () => {
  await addRun(true, 30);
  expect((await backupStatus()).overdue).toBe(true);
});
