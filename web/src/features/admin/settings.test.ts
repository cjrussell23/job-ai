import { afterAll, beforeEach, expect, test } from "vitest";
import { closeDb } from "@/db/client";
import { resetDb } from "@/test/db";
import { getSettings, setSetting } from "./settings";

beforeEach(resetDb);
afterAll(closeDb);

test("defaults apply when nothing is stored", async () => {
  const settings = await getSettings();
  expect(settings.models.scoreTargetFit).toBe("claude-haiku-5-5");
  expect(settings.models.draftCoverLetter).toBe("claude-sonnet-5-5");
  expect(settings.defaultSpendCapCents).toBe(1000);
  expect(settings.rescoreLimitPerDay).toBe(1);
});

test("stored values override defaults, and invalid ones are refused", async () => {
  expect(await setSetting("defaultSpendCapCents", 2500)).toEqual({ ok: true });
  expect(await setSetting("rescoreLimitPerDay", -1)).toEqual({ ok: false, reason: "invalid" });
  const settings = await getSettings();
  expect(settings.defaultSpendCapCents).toBe(2500);
  expect(settings.rescoreLimitPerDay).toBe(1);
});
