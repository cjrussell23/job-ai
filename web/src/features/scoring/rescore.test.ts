import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { jobMatches } from "@/db/schema";
import { setSetting } from "@/features/admin/settings";
import { ingestPostings } from "@/features/jobs/ingest";
import { createItem } from "@/features/profile/profile";
import { parsePostings } from "@/features/sources/source";
import { approveSearchTitles, createTarget, updateTarget } from "@/features/targets/targets";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import { refilterTarget, requestRescore, rescoreStatus, runRescore } from "./rescore";
import { scoreAfterRun } from "./score";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

let scoreGiven = 80;
const replies = (prompt: string) => {
  if (prompt.includes("estimate the likely pay")) {
    return { min: 17, max: 19, period: "hour", certainty: "low", reason: "Typical pay." };
  }
  return { score: scoreGiven, reason: "A reason." };
};

/** A member with one scored match for a Calgary barista job paying $18/h. */
async function scoredMember() {
  const userId = await createMember("a@example.com");
  const target = await createTarget(userId, { roleType: "Barista", locations: ["Calgary, AB"] });
  if (!target.ok) throw new Error("target not created");
  await approveSearchTitles(userId, target.id, ["Barista"]);
  const { postings } = parsePostings([
    {
      url: "https://ca.indeed.com/viewjob?jk=1",
      title: "Barista",
      company: "Bean Co",
      location: "Calgary, AB",
      description: "Make coffee.",
      pay: { min: 18, max: 18, period: "hour" },
    },
  ]);
  await ingestPostings("indeed", postings, new Date(), "Barista");
  restore = fakeModel(replies).restore;
  scoreGiven = 80;
  await scoreAfterRun();
  return { userId, targetId: target.id };
}

const match = async (userId: string) =>
  (await db().select().from(jobMatches).where(eq(jobMatches.userId, userId)))[0];

describe("rescoring", () => {
  test("nothing to rescore until the profile or a target changes", async () => {
    const { userId } = await scoredMember();
    expect(await rescoreStatus(userId)).toMatchObject({ staleProfile: 0, staleTarget: 0 });
    expect(await requestRescore(userId)).toEqual({ ok: false, reason: "nothing_changed" });
  });

  test("a profile change makes only profile fit stale, and a rescore redoes only that score", async () => {
    const { userId } = await scoredMember();
    await new Promise((r) => setTimeout(r, 5));
    await createItem(userId, { type: "skill", title: "Latte art" });
    expect(await rescoreStatus(userId)).toMatchObject({ staleProfile: 1, staleTarget: 0 });

    const request = await requestRescore(userId);
    if (!request.ok) throw new Error("rescore refused");
    scoreGiven = 95;
    await runRescore(userId, request.requestId);

    expect(await match(userId)).toMatchObject({ profileFit: 95, targetFit: 80 });
    expect(await rescoreStatus(userId)).toMatchObject({ staleProfile: 0, running: false });
  });

  test("a target edit makes only target fit stale", async () => {
    const { userId, targetId } = await scoredMember();
    await new Promise((r) => setTimeout(r, 5));
    await updateTarget(userId, targetId, {
      roleType: "Barista",
      locations: ["Calgary, AB"],
      note: "Mornings only",
    });
    expect(await rescoreStatus(userId)).toMatchObject({ staleProfile: 0, staleTarget: 1 });
  });

  test("the admin's daily limit is enforced", async () => {
    const { userId } = await scoredMember();
    await setSetting("rescoreLimitPerDay", 1);
    await createItem(userId, { type: "skill", title: "Latte art" });
    const first = await requestRescore(userId);
    if (!first.ok) throw new Error("rescore refused");
    await runRescore(userId, first.requestId);
    await new Promise((r) => setTimeout(r, 5));
    await createItem(userId, { type: "skill", title: "Pour over" });
    expect(await requestRescore(userId)).toEqual({ ok: false, reason: "limit_reached" });
  });

  test("one member cannot see or use another member's rescore", async () => {
    const { userId } = await scoredMember();
    const other = await createMember("b@example.com");
    await createItem(userId, { type: "skill", title: "Latte art" });
    expect(await rescoreStatus(other)).toMatchObject({ staleProfile: 0, staleTarget: 0 });
    expect(await requestRescore(other)).toEqual({ ok: false, reason: "nothing_changed" });
  });
});

describe("firm limits apply at once", () => {
  test("tightening a firm pay limit hides the match without any model call", async () => {
    const { userId, targetId } = await scoredMember();
    const fake = fakeModel(replies);
    restore = fake.restore;
    await updateTarget(userId, targetId, {
      roleType: "Barista",
      locations: ["Calgary, AB"],
      payIsFirm: true,
      minPayCents: 2000,
      payBasis: "hourly",
    });
    expect(await refilterTarget(userId, targetId)).toBe(1);
    expect(await match(userId)).toMatchObject({ firmLimitResult: "fail", failedLimits: ["pay"] });
    expect(fake.calls).toHaveLength(0);
  });
});
