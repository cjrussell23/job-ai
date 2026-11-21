import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { jobMatches, jobs } from "@/db/schema";
import { feedForUser } from "@/features/scoring/feed";
import { refilterJobForMember } from "@/features/scoring/rescore";
import { createMatches } from "@/features/scoring/score";
import { parsePostings } from "@/features/sources/source";
import { approveSearchTitles, createTarget } from "@/features/targets/targets";
import { resetDb } from "@/test/db";
import { createMember } from "@/test/fixtures";
import { ingestPostings } from "./ingest";
import { payText } from "./jobs";
import { clearPay, confirmEstimate, enterPay, memberPayFor, withMemberPay } from "./member-pay";

beforeEach(resetDb);
afterAll(closeDb);

async function member(email: string) {
  const userId = await createMember(email);
  const target = await createTarget(userId, {
    roleType: "Barista",
    locations: ["Calgary, AB"],
    payIsFirm: true,
    minPayCents: 2000,
    payBasis: "hourly",
  });
  if (!target.ok) throw new Error("target");
  await approveSearchTitles(userId, target.id, ["Barista"]);
  return userId;
}

async function matchFor(userId: string, jobId: string) {
  const [match] = await db()
    .select()
    .from(jobMatches)
    .where(and(eq(jobMatches.userId, userId), eq(jobMatches.jobId, jobId)));
  return match;
}

describe("pay a member records", () => {
  test("counts as known pay for that member only, and is labelled", async () => {
    const a = await member("a@example.com");
    const b = await member("b@example.com");
    const { postings } = parsePostings([
      {
        url: "https://ca.indeed.com/viewjob?jk=1",
        title: "Barista",
        company: "Bean Co",
        location: "Calgary, AB",
        description: "Coffee.",
      },
    ]);
    await ingestPostings("indeed", postings, new Date(), "Barista");
    const [job] = await db().select().from(jobs);
    if (!job) throw new Error("job");
    await createMatches();
    expect(await matchFor(a, job.id)).toMatchObject({
      firmLimitResult: "pass",
      unknownFields: ["pay"],
    });

    expect(await enterPay(a, job.id, { payMin: 16, payMax: 15, payPeriod: "hour" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await enterPay(a, job.id, { payMin: 16, payMax: 17, payPeriod: "hour" })).toEqual({
      ok: true,
    });
    await refilterJobForMember(a, job.id);
    expect(await matchFor(a, job.id)).toMatchObject({
      firmLimitResult: "fail",
      failedLimits: ["pay"],
    });
    // The other member is untouched and never sees it.
    expect(await matchFor(b, job.id)).toMatchObject({
      firmLimitResult: "pass",
      unknownFields: ["pay"],
    });
    expect((await memberPayFor(b, [job.id])).size).toBe(0);
    expect((await feedForUser(b, 0.5))[0]?.job.memberPay).toBeUndefined();

    const mine = (await memberPayFor(a, [job.id])).get(job.id);
    expect(payText(withMemberPay(job, mine))).toBe("$16–$17 per hour (you entered)");

    expect(await confirmEstimate(a, job.id)).toEqual({ ok: false, reason: "no_estimate" });
    await db()
      .update(jobs)
      .set({
        payEstimateMin: 21,
        payEstimateMax: 23,
        payEstimatePeriod: "hour",
        payEstimateCertainty: "medium",
      })
      .where(eq(jobs.id, job.id));
    expect(await confirmEstimate(a, job.id)).toEqual({ ok: true });
    await refilterJobForMember(a, job.id);
    expect(await matchFor(a, job.id)).toMatchObject({ firmLimitResult: "pass", unknownFields: [] });
    expect((await memberPayFor(a, [job.id])).get(job.id)).toMatchObject({
      payMin: 21,
      source: "confirmed_estimate",
    });

    await clearPay(a, job.id);
    await refilterJobForMember(a, job.id);
    expect(await matchFor(a, job.id)).toMatchObject({
      firmLimitResult: "pass",
      unknownFields: ["pay"],
    });
  });
});
