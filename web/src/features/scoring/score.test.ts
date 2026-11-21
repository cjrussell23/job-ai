import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { jobMatches, jobs } from "@/db/schema";
import { ingestPostings } from "@/features/jobs/ingest";
import { createItem } from "@/features/profile/profile";
import { parsePostings } from "@/features/sources/source";
import { approveSearchTitles, createTarget, type TargetInput } from "@/features/targets/targets";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import { dismissJob, feedForUser } from "./feed";
import { createMatches, scoreAfterRun } from "./score";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

/** Replies by task: the pay estimate, target fit and profile fit prompts differ. */
const replies = (prompt: string) => {
  if (prompt.includes("work out its pay")) {
    return {
      stated: null,
      estimate: {
        min: 17,
        max: 19,
        period: "hour",
        certainty: "medium",
        reason: "Typical Calgary cafe pay.",
      },
    };
  }
  if (prompt.includes("Their profile")) return { score: 60, reason: "You have cafe experience." };
  return { score: 90, reason: "This is the kind of job you want." };
};

async function member(email: string, target: Partial<TargetInput> = {}) {
  const userId = await createMember(email);
  const created = await createTarget(userId, {
    roleType: "Barista",
    locations: ["Calgary, AB"],
    ...target,
  });
  if (!created.ok) throw new Error("target not created");
  await approveSearchTitles(userId, created.id, ["Barista"]);
  return { userId, targetId: created.id };
}

async function addJob(overrides: Record<string, unknown> = {}, foundBy: string | null = "Barista") {
  const { postings } = parsePostings([
    {
      url: `https://ca.indeed.com/viewjob?jk=${Math.random()}`,
      title: "Barista",
      company: "Bean Co",
      location: "Calgary, AB",
      description: "Make espresso drinks for a busy downtown cafe.",
      ...overrides,
    },
  ]);
  await ingestPostings("indeed", postings, new Date(), foundBy);
}

describe("matching and firm limits", () => {
  test("jobs found for a target's titles become matches; firm limits hide failures before any model call", async () => {
    const { userId } = await member("a@example.com", {
      payIsFirm: true,
      minPayCents: 2000,
      payBasis: "hourly",
    });
    await addJob({
      url: "https://ca.indeed.com/viewjob?jk=low",
      company: "Low Pay Cafe",
      pay: { min: 16, max: 16, period: "hour" },
    });
    await addJob({
      url: "https://ca.indeed.com/viewjob?jk=ok",
      company: "Good Pay Cafe",
      pay: { min: 21, max: 23, period: "hour" },
    });
    await addJob({ url: "https://ca.indeed.com/viewjob?jk=none", company: "No Pay Cafe" });

    const fake = fakeModel(replies);
    restore = fake.restore;
    const summary = await scoreAfterRun();

    expect(summary).toMatchObject({ newMatches: 3, hiddenByFirmLimits: 1, scored: 2 });
    const matches = await db().select().from(jobMatches).where(eq(jobMatches.userId, userId));
    const byCompany = async (company: string) => {
      const [job] = await db().select().from(jobs).where(eq(jobs.company, company));
      return matches.find((m) => m.jobId === job?.id);
    };
    expect(await byCompany("Low Pay Cafe")).toMatchObject({
      firmLimitResult: "fail",
      failedLimits: ["pay"],
      targetFit: null,
    });
    // Missing pay is unknown, never a fail.
    expect(await byCompany("No Pay Cafe")).toMatchObject({
      firmLimitResult: "pass",
      unknownFields: ["pay"],
      targetFit: 90,
    });

    // The failing job never reached a model: one pay estimate, then two scores for each of two jobs.
    const scoringPrompts = fake.calls.filter(
      (c) => !JSON.stringify(c.prompt).includes("work out its pay"),
    );
    expect(scoringPrompts).toHaveLength(4);
    expect(scoringPrompts.some((c) => JSON.stringify(c.prompt).includes("Low Pay Cafe"))).toBe(
      false,
    );
  });

  test("jobs from other searches only match when their title fits", async () => {
    await member("a@example.com");
    await addJob(
      { url: "https://ca.indeed.com/viewjob?jk=1", title: "Senior Barista" },
      "Line Cook",
    );
    await addJob({ url: "https://ca.indeed.com/viewjob?jk=2", title: "Line Cook" }, "Line Cook");
    expect(await createMatches()).toEqual({ created: 1, hidden: 0 });
  });

  test("matching runs once per job and target", async () => {
    await member("a@example.com");
    await addJob();
    await createMatches();
    expect(await createMatches()).toEqual({ created: 0, hidden: 0 });
  });
});

describe("pay estimates", () => {
  test("a job without stated pay gets one shared, labelled estimate; it never counts toward a member's cap", async () => {
    await member("a@example.com");
    await addJob();
    restore = fakeModel(replies).restore;
    await scoreAfterRun();
    const [job] = await db().select().from(jobs);
    expect(job).toMatchObject({
      payPeriod: null,
      payEstimateMin: 17,
      payEstimateMax: 19,
      payEstimateCertainty: "medium",
    });
    // A second run does not estimate it again.
    expect((await scoreAfterRun()).payEstimates).toBe(0);
  });
});

describe("the feed", () => {
  test("shows a member only their own passing, undismissed matches, best first", async () => {
    const alice = await member("alice@example.com");
    const bob = await member("bob@example.com", { roleType: "Bean tester" });
    await addJob({ url: "https://ca.indeed.com/viewjob?jk=1", company: "First Cafe" });
    await addJob({ url: "https://ca.indeed.com/viewjob?jk=2", company: "Second Cafe" });
    restore = fakeModel(replies).restore;
    await scoreAfterRun();

    const feed = await feedForUser(alice.userId, 60);
    expect(feed).toHaveLength(2);
    // 90 target fit and 60 profile fit at a 60% weight.
    expect(feed[0]?.best).toMatchObject({
      combined: 78,
      targetName: "Barista · Calgary, AB or remote",
      userId: alice.userId,
    });

    const firstJobId = feed[0]?.job.id ?? "";
    await dismissJob(alice.userId, firstJobId);
    expect(await feedForUser(alice.userId, 60)).toHaveLength(1);
    // Bob's feed is untouched by Alice dismissing a job.
    expect(await feedForUser(bob.userId, 60)).toHaveLength(2);
  });

  test("profile fit uses only the member's own profile", async () => {
    const alice = await member("alice@example.com");
    await member("bob@example.com");
    await createItem(alice.userId, { type: "skill", title: "Latte art" });
    await addJob();
    const fake = fakeModel(replies);
    restore = fake.restore;
    await scoreAfterRun();
    const profilePrompts = fake.calls
      .map((c) => JSON.stringify(c.prompt))
      .filter((p) => p.includes("Their profile"));
    expect(profilePrompts.filter((p) => p.includes("Latte art"))).toHaveLength(1);
    expect(profilePrompts).toHaveLength(2);
  });
});
