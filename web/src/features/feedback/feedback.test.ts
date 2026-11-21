import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { feedback, jobs, members } from "@/db/schema";
import { ingestPostings } from "@/features/jobs/ingest";
import { scoreAfterRun } from "@/features/scoring/score";
import { parsePostings } from "@/features/sources/source";
import { approveSearchTitles, createTarget } from "@/features/targets/targets";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import {
  addPreference,
  gradesByJob,
  listPreferences,
  recordFeedback,
  replaceLearnedStatements,
  targetChangePrompts,
  updatePreference,
} from "./feedback";
import { learnForMember } from "./learn";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

async function memberWithJobs(n: number) {
  const userId = await createMember("a@example.com");
  const target = await createTarget(userId, { roleType: "Barista", locations: ["Calgary, AB"] });
  if (!target.ok) throw new Error("target not created");
  await approveSearchTitles(userId, target.id, ["Barista"]);
  const { postings } = parsePostings(
    Array.from({ length: n }, (_, i) => ({
      url: `https://ca.indeed.com/viewjob?jk=${i}`,
      title: "Barista",
      company: `Cafe ${i}`,
      location: "Calgary, AB",
      description: "Make coffee.",
    })),
  );
  await ingestPostings("indeed", postings, new Date(), "Barista");
  const jobIds = (await db().select({ id: jobs.id }).from(jobs)).map((j) => j.id);
  return { userId, targetId: target.id, jobIds };
}

describe("grades", () => {
  test("a new grade replaces the old one for the same job; actions are kept", async () => {
    const { userId, targetId, jobIds } = await memberWithJobs(1);
    const jobId = jobIds[0] ?? "";
    await recordFeedback(userId, { jobId, targetId, kind: "up" });
    await recordFeedback(userId, { jobId, targetId, kind: "down", reason: "pay" });
    await recordFeedback(userId, { jobId, targetId, kind: "dismissed" });
    const rows = await db().select().from(feedback);
    expect(rows.map((r) => r.kind).sort()).toEqual(["dismissed", "down"]);
    expect((await gradesByJob(userId)).get(jobId)).toMatchObject({ kind: "down", reason: "pay" });
  });

  test("one member's grades are never another's", async () => {
    const { userId, targetId, jobIds } = await memberWithJobs(1);
    const other = await createMember("b@example.com");
    await recordFeedback(userId, { jobId: jobIds[0] ?? "", targetId, kind: "up" });
    expect((await gradesByJob(other)).size).toBe(0);
  });
});

describe("target change prompts", () => {
  test("three thumbs down for pay on one target in a month prompts a firm pay limit", async () => {
    const { userId, targetId, jobIds } = await memberWithJobs(3);
    for (const jobId of jobIds.slice(0, 2)) {
      await recordFeedback(userId, { jobId, targetId, kind: "down", reason: "pay" });
    }
    expect(await targetChangePrompts(userId)).toEqual([]);
    await recordFeedback(userId, { jobId: jobIds[2] ?? "", targetId, kind: "down", reason: "pay" });
    expect(await targetChangePrompts(userId)).toEqual([{ targetId, reason: "pay", count: 3 }]);
  });
});

describe("learned preferences", () => {
  test("learning keeps the member's own statements and replaces only learned ones", async () => {
    const { userId, targetId, jobIds } = await memberWithJobs(3);
    await addPreference(userId, "Avoid night shifts");
    for (const jobId of jobIds)
      await recordFeedback(userId, { jobId, targetId, kind: "down", reason: "company" });

    const fake = fakeModel({ statements: ["Avoids chain cafes", "Avoid night shifts"] });
    restore = fake.restore;
    expect(await learnForMember(userId, null)).toBe(true);
    expect((await listPreferences(userId)).map((p) => [p.statement, p.origin])).toEqual([
      ["Avoid night shifts", "member"],
      ["Avoids chain cafes", "feedback"],
    ]);
    // The prompt carried the ratings.
    expect(JSON.stringify(fake.calls[0]?.prompt)).toContain("Not for them: Barista at Cafe");

    await replaceLearnedStatements(userId, ["Prefers independent cafes"]);
    expect((await listPreferences(userId)).map((p) => p.statement)).toEqual([
      "Avoid night shifts",
      "Prefers independent cafes",
    ]);
  });

  test("learning waits for enough new feedback", async () => {
    const { userId, targetId, jobIds } = await memberWithJobs(1);
    await recordFeedback(userId, { jobId: jobIds[0] ?? "", targetId, kind: "up" });
    const fake = fakeModel({ statements: [] });
    restore = fake.restore;
    expect(await learnForMember(userId, null)).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });

  test("editing a preference marks target fit stale; preferences reach the scoring prompt", async () => {
    const { userId } = await memberWithJobs(1);
    await addPreference(userId, "Avoids chain cafes");
    const [member] = await db().select().from(members).where(eq(members.userId, userId));
    expect(member?.preferencesChangedAt).not.toBeNull();

    const fake = fakeModel({ score: 70, reason: "Fine." });
    restore = fake.restore;
    await scoreAfterRun();
    const targetPrompt = fake.calls
      .map((c) => JSON.stringify(c.prompt))
      .find((p) => p.includes("What they want"));
    expect(targetPrompt).toContain("Avoids chain cafes");

    const [pref] = await listPreferences(userId);
    expect(await updatePreference(userId, pref?.id ?? "", { active: false })).toEqual({ ok: true });
    const other = await createMember("b@example.com");
    expect(await updatePreference(other, pref?.id ?? "", { active: true })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
