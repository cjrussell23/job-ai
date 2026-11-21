import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { jobMatches } from "@/db/schema";
import { ingestPostings } from "@/features/jobs/ingest";
import { setDiscordUserId, updateMemberSettings } from "@/features/members/members";
import { scoreAfterRun } from "@/features/scoring/score";
import { parsePostings } from "@/features/sources/source";
import { approveSearchTitles, createTarget } from "@/features/targets/targets";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import { matchesMessage, notifyNewMatches } from "./notify";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

const discordId = "123456789012345678";

async function memberWithMatches(threshold: number) {
  const userId = await createMember("a@example.com");
  await updateMemberSettings(userId, { scoreThreshold: threshold, targetFitWeight: 60 });
  await setDiscordUserId(userId, discordId);
  const target = await createTarget(userId, { roleType: "Barista", locations: ["Calgary, AB"] });
  if (!target.ok) throw new Error("target not created");
  await approveSearchTitles(userId, target.id, ["Barista"]);
  const { postings } = parsePostings(
    ["Bean Co", "Leaf Co"].map((company, i) => ({
      url: `https://ca.indeed.com/viewjob?jk=${i}`,
      title: "Barista",
      company,
      location: "Calgary, AB",
      description: "Make coffee.",
      pay: { min: 18, max: 18, period: "hour" },
    })),
  );
  await ingestPostings("indeed", postings, new Date(), "Barista");
  // Bean Co scores 90 on both; Leaf Co scores 50.
  restore = fakeModel((prompt: string) =>
    prompt.includes("Leaf Co") ? { score: 50, reason: "Meh." } : { score: 90, reason: "Great." },
  ).restore;
  await scoreAfterRun();
  return userId;
}

describe("Discord notifications", () => {
  test("a member hears about new matches at or above their threshold, once", async () => {
    await memberWithMatches(70);
    const sent: { to: string; content: string }[] = [];
    const send = async (to: string, content: string) => {
      sent.push({ to, content });
    };

    expect(await notifyNewMatches(send)).toMatchObject({ members: 1, sent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(discordId);
    expect(sent[0]?.content).toContain("Bean Co (90)");
    expect(sent[0]?.content).not.toContain("Leaf Co");

    // A second run sends nothing new.
    expect(await notifyNewMatches(send)).toMatchObject({ sent: 0, skipped: 1 });
    expect(sent).toHaveLength(1);
  });

  test("a failed send is logged, not marked as told, and retried next time", async () => {
    const userId = await memberWithMatches(70);
    const failing = async () => {
      throw new Error("Discord refused the DM channel (403)");
    };
    expect(await notifyNewMatches(failing)).toMatchObject({ failed: 1, sent: 0 });
    const matches = await db().select().from(jobMatches).where(eq(jobMatches.userId, userId));
    expect(matches.every((m) => m.notifiedAt === null)).toBe(true);
  });

  test("members without a Discord ID are not messaged", async () => {
    const userId = await memberWithMatches(70);
    await setDiscordUserId(userId, "");
    const sent: string[] = [];
    expect(await notifyNewMatches(async (to) => void sent.push(to))).toMatchObject({ members: 0 });
    expect(sent).toHaveLength(0);
  });

  test("Discord IDs are validated", async () => {
    const userId = await createMember("b@example.com");
    expect(await setDiscordUserId(userId, "not-an-id")).toEqual({ ok: false, reason: "invalid" });
    expect(await setDiscordUserId(userId, ` ${discordId} `)).toEqual({ ok: true });
  });
});

test("messages escape Discord formatting and stay under the length limit", () => {
  const message = matchesMessage(
    [{ title: "**Lead** _Dev_", company: "A|B", score: 88 }],
    70,
    "https://jobs.example.com",
  );
  expect(message).toContain("\\*\\*Lead\\*\\* \\_Dev\\_ at A\\|B (88)");
  expect(message).toContain("https://jobs.example.com");
  const many = Array.from({ length: 40 }, (_, i) => ({
    title: "x".repeat(300),
    company: `C${i}`,
    score: 80,
  }));
  const long = matchesMessage(many, 70, undefined);
  expect(long.length).toBeLessThanOrEqual(2000);
  expect(long).toContain("and 30 more");
});
