import { afterAll, afterEach, beforeEach, expect, test } from "vitest";
import { z } from "zod";
import { closeDb, db } from "@/db/client";
import { aiUsage } from "@/db/schema";
import { setSetting } from "@/features/admin/settings";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import { setPriceListForTests } from "./pricing";
import { runTask } from "./run-task";
import type { TaskDefinition } from "./task";

const echoTask: TaskDefinition<{ text: string }, { words: string[] }> = {
  name: "proposeSearchTitles",
  promptVersion: "test-1",
  schema: z.object({ words: z.array(z.string()) }),
  allowedPastCap: false,
  maxOutputTokens: 200,
  buildPrompt: ({ text }) => ({ system: "Split into words.", prompt: text }),
};

let restore = () => {};
let restorePrices = () => {};
beforeEach(async () => {
  await resetDb();
  // Haiku 5.5 as the gateway prices it: $0.10 and $0.50 per million tokens.
  restorePrices = setPriceListForTests(
    new Map([["anthropic/claude-haiku-5.5", { input: 0.1e-6, output: 0.5e-6 }]]),
  );
});
afterEach(() => {
  restore();
  restorePrices();
});
afterAll(closeDb);

test("returns validated output and records usage and cost", async () => {
  const userId = await createMember("a@example.com");
  const fake = fakeModel({ words: ["hello", "world"] });
  restore = fake.restore;

  const result = await runTask(userId, echoTask, { text: "hello world" });

  expect(result).toEqual({ ok: true, output: { words: ["hello", "world"] } });
  expect(fake.calls[0]?.modelId).toBe("anthropic/claude-haiku-5.5");
  const [usage] = await db().select().from(aiUsage);
  expect(usage).toMatchObject({ userId, task: "proposeSearchTitles", promptVersion: "test-1" });
  // 1,000 input and 500 output tokens at the gateway's Haiku 5.5 price.
  expect(usage?.costUsd).toBeCloseTo(0.00035, 8);
});

test("uses the model chosen in the admin settings", async () => {
  const userId = await createMember("a@example.com");
  await setSetting("models", {
    parseResume: "anthropic/claude-haiku-5.5",
    proposeSearchTitles: "anthropic/claude-sonnet-5.5",
    scoreTargetFit: "anthropic/claude-haiku-5.5",
    scoreProfileFit: "anthropic/claude-haiku-5.5",
    estimatePay: "anthropic/claude-haiku-5.5",
    learnPreferences: "anthropic/claude-haiku-5.5",
    draftCoverLetter: "anthropic/claude-sonnet-5.5",
    tailorResume: "anthropic/claude-sonnet-5.5",
    reviewProfile: "anthropic/claude-sonnet-5.5",
    pickResumeItems: "anthropic/claude-sonnet-5.5",
  });
  const fake = fakeModel({ words: [] });
  restore = fake.restore;
  await runTask(userId, echoTask, { text: "" });
  expect(fake.calls[0]?.modelId).toBe("anthropic/claude-sonnet-5.5");
});

test("output that fails the schema is refused but still counted", async () => {
  const userId = await createMember("a@example.com");
  const fake = fakeModel({ words: "not an array" });
  restore = fake.restore;

  expect(await runTask(userId, echoTask, { text: "x" })).toEqual({
    ok: false,
    reason: "invalid_output",
  });
  expect(await db().select().from(aiUsage)).toHaveLength(1);
});

test("at the cap, optional tasks are refused without calling the model", async () => {
  const userId = await createMember("a@example.com", 100);
  await db().insert(aiUsage).values({
    userId,
    task: "draftCoverLetter",
    model: "anthropic/claude-sonnet-5.5",
    promptVersion: "v1",
    inputTokens: 1,
    outputTokens: 1,
    costUsd: 1.0,
  });
  const fake = fakeModel({ words: [] });
  restore = fake.restore;

  expect(await runTask(userId, echoTask, { text: "x" })).toEqual({
    ok: false,
    reason: "cap_reached",
  });
  expect(fake.calls).toHaveLength(0);

  const scoring = { ...echoTask, allowedPastCap: true };
  expect((await runTask(userId, scoring, { text: "x" })).ok).toBe(true);
});

test("usage is counted per member", async () => {
  const a = await createMember("a@example.com", 100);
  const b = await createMember("b@example.com", 100);
  await db().insert(aiUsage).values({
    userId: a,
    task: "draftCoverLetter",
    model: "anthropic/claude-sonnet-5.5",
    promptVersion: "v1",
    inputTokens: 1,
    outputTokens: 1,
    costUsd: 5,
  });
  const fake = fakeModel({ words: [] });
  restore = fake.restore;
  expect((await runTask(b, echoTask, { text: "x" })).ok).toBe(true);
});

test("a model missing from the gateway price list is costed at the high fallback rate", async () => {
  const userId = await createMember("a@example.com");
  await setSetting("models", {
    parseResume: "anthropic/claude-haiku-5.5",
    proposeSearchTitles: "someone/new-model",
    scoreTargetFit: "anthropic/claude-haiku-5.5",
    scoreProfileFit: "anthropic/claude-haiku-5.5",
    estimatePay: "anthropic/claude-haiku-5.5",
    learnPreferences: "anthropic/claude-haiku-5.5",
    draftCoverLetter: "anthropic/claude-sonnet-5.5",
    tailorResume: "anthropic/claude-sonnet-5.5",
    reviewProfile: "anthropic/claude-sonnet-5.5",
    pickResumeItems: "anthropic/claude-sonnet-5.5",
  });
  restore = fakeModel({ words: [] }).restore;
  await runTask(userId, echoTask, { text: "x" });
  const [usage] = await db().select().from(aiUsage);
  // 1,000 x $15/M + 500 x $75/M.
  expect(usage?.costUsd).toBeCloseTo(0.0525, 8);
});
