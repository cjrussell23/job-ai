import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { closeDb } from "@/db/client";
import { createItem } from "@/features/profile/profile";
import { resetDb } from "@/test/db";
import { createMember } from "@/test/fixtures";
import {
  publicResumeJson,
  sharedResume,
  shareStandingResume,
  unshareStandingResume,
} from "./public";
import { saveStandingResume } from "./standing";

beforeEach(resetDb);
afterAll(closeDb);

async function resume(userId: string) {
  const role = await createItem(userId, { type: "role", title: "Analyst", organization: "Acme" });
  if (!role.ok) throw new Error("no role");
  const bullet = await createItem(userId, {
    type: "bullet",
    parentId: role.id,
    content: "Built reports",
  });
  if (!bullet.ok) throw new Error("no bullet");
  const saved = await saveStandingResume(userId, null, "Data roles", [role.id, bullet.id]);
  if (!saved.ok) throw new Error("not saved");
  return saved.id;
}

describe("public resume links", () => {
  test("a shared resume reads by its token until sharing stops", async () => {
    const userId = await createMember("a@example.com");
    const id = await resume(userId);
    expect(await sharedResume("x".repeat(43))).toBeNull();

    const token = await shareStandingResume(userId, id);
    if (!token) throw new Error("not shared");
    // Sharing again keeps the same link rather than breaking one already handed out.
    expect(await shareStandingResume(userId, id)).toBe(token);

    const shared = await sharedResume(token);
    expect(shared?.id).toBe(id);
    if (!shared) throw new Error("not found");
    const json = publicResumeJson(shared, "https://example.com/pdf");
    expect(json.sections[0]?.entries[0]?.lines).toEqual(["Built reports"]);
    // The app's bookkeeping (profile item ids, line sources) stays private.
    expect(JSON.stringify(json)).not.toContain("sources");
    expect(JSON.stringify(json)).not.toContain("itemId");

    expect(await unshareStandingResume(userId, id)).toBe(true);
    expect(await sharedResume(token)).toBeNull();
    // A new link after stopping is a different one: the old link never comes back.
    expect(await shareStandingResume(userId, id)).not.toBe(token);
  });

  test("one member cannot share or stop sharing another's resume", async () => {
    const owner = await createMember("a@example.com");
    const other = await createMember("b@example.com");
    const id = await resume(owner);
    expect(await shareStandingResume(other, id)).toBeNull();
    const token = await shareStandingResume(owner, id);
    if (!token) throw new Error("not shared");
    expect(await unshareStandingResume(other, id)).toBe(false);
    expect(await sharedResume(token)).not.toBeNull();
  });
});
