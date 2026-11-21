import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb } from "@/db/client";
import { createItem } from "@/features/profile/profile";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import { readFeedback, runFeedback } from "./feedback";
import { getStandingResume, saveStandingResume } from "./standing";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

describe("AI resume feedback", () => {
  test("is saved on the member's own resume and never on another's", async () => {
    const userId = await createMember("a@example.com");
    const role = await createItem(userId, { type: "role", title: "Analyst", organization: "Acme" });
    if (!role.ok) throw new Error("role");
    const saved = await saveStandingResume(userId, null, "Main", [role.id]);
    if (!saved.ok) throw new Error("saved");
    const fake = fakeModel({
      overall: "Clear and short.",
      suggestions: [{ aspect: "impact", advice: "Add a result if you have one.", quote: null }],
    });
    restore = fake.restore;

    const other = await createMember("b@example.com");
    await runFeedback(other, saved.id);
    expect(fake.calls).toHaveLength(0);

    await runFeedback(userId, saved.id);
    const feedback = readFeedback((await getStandingResume(userId, saved.id))?.feedback);
    expect(feedback).toMatchObject({ state: "done", overall: "Clear and short.", version: 1 });
    expect(JSON.stringify(fake.calls[0]?.prompt)).toContain("Analyst");
  });
});
