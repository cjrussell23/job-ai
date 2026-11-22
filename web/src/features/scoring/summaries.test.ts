import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { matchSummaries, members } from "@/db/schema";
import { setSetting } from "@/features/admin/settings";
import { ingestPostings } from "@/features/jobs/ingest";
import { parsePostings } from "@/features/sources/source";
import { approveSearchTitles, createTarget } from "@/features/targets/targets";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import { scoreAfterRun } from "./score";
import { rateSummary, summaryRatingLines, summaryThreshold } from "./summaries";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

const replies = (prompt: string) => {
  if (prompt.includes("work out its pay")) {
    return {
      stated: null,
      estimate: { min: 17, max: 19, period: "hour", certainty: "medium", reason: "Typical." },
    };
  }
  if (prompt.includes("personal read of one job")) {
    return {
      headline: "A downtown cafe close to you, with the morning hours you want.",
      points: [
        { kind: "plus", text: "Morning shifts match your note." },
        { kind: "check", text: "The posting doesn't say if tips are shared." },
      ],
    };
  }
  if (prompt.includes("Their profile")) return { score: 60, reason: "Cafe experience." };
  return { score: 90, reason: "The kind of job you want." };
};

async function member(email: string, summaryScore: number) {
  const userId = await createMember(email);
  await db().update(members).set({ summaryScore }).where(eq(members.userId, userId));
  const target = await createTarget(userId, { roleType: "Barista", locations: ["Calgary, AB"] });
  if (!target.ok) throw new Error("target");
  await approveSearchTitles(userId, target.id, ["Barista"]);
  return userId;
}

describe("match summaries", () => {
  test("the higher of the member's score and the admin's minimum applies", () => {
    expect(summaryThreshold(70, 75)).toBe(75);
    expect(summaryThreshold(85, 75)).toBe(85);
  });

  test("strong matches get one summary each, only for members whose threshold they reach, and ratings stay private", async () => {
    await setSetting("summaryMinScore", 75);
    // Combined score: 60% of 90 plus 40% of 60 = 78.
    const keen = await member("keen@example.com", 70);
    const picky = await member("picky@example.com", 85);
    const { postings } = parsePostings([
      {
        url: "https://ca.indeed.com/viewjob?jk=1",
        title: "Barista",
        company: "Bean Co",
        location: "Calgary, AB",
        description: "Morning shifts making espresso.",
      },
    ]);
    await ingestPostings("indeed", postings, new Date(), "Barista");
    const fake = fakeModel(replies);
    restore = fake.restore;

    const summary = await scoreAfterRun();
    expect(summary.summaries).toBe(1);
    const rows = await db().select().from(matchSummaries);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: keen, promptVersion: "summarize-match-v1" });
    expect(
      (await db().select().from(matchSummaries).where(eq(matchSummaries.userId, picky))).length,
    ).toBe(0);

    // A second run writes nothing new.
    expect((await scoreAfterRun()).summaries).toBe(0);

    const id = rows[0]?.id ?? "";
    expect(await rateSummary(picky, id, { rating: "down", reason: "wrong", comment: "" })).toEqual({
      ok: false,
    });
    expect(
      await rateSummary(keen, id, {
        rating: "down",
        reason: "too_generic",
        comment: "Tell me about tips.",
      }),
    ).toEqual({ ok: true });
    const lines = await summaryRatingLines(keen, 5);
    expect(lines[0]).toContain("Not helpful (too generic)");
    expect(lines[0]).toContain("Tell me about tips.");
    expect(await summaryRatingLines(picky, 5)).toEqual([]);
  });
});
