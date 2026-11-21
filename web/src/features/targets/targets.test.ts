import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb } from "@/db/client";
import { createItem } from "@/features/profile/profile";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import { proposeTitlesForTarget } from "./propose-titles";
import {
  approveSearchTitles,
  createTarget,
  deleteTarget,
  getTarget,
  listTargets,
  setTargetActive,
  targetLabel,
  updateTarget,
} from "./targets";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

async function newTarget(userId: string, roleType = "Backend engineer") {
  const result = await createTarget(userId, { roleType, locations: ["Calgary, AB"] });
  if (!result.ok) throw new Error("target not created");
  return result.id;
}

describe("job targets are scoped to their user", () => {
  test("one user cannot see, change, pause or delete another user's targets", async () => {
    const alice = await createMember("alice@example.com");
    const bob = await createMember("bob@example.com");
    const id = await newTarget(alice);

    expect(await listTargets(bob)).toHaveLength(0);
    expect(await getTarget(bob, id)).toBeUndefined();
    expect(await updateTarget(bob, id, { roleType: "Hacked" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await setTargetActive(bob, id, false)).toBe(false);
    expect(await approveSearchTitles(bob, id, ["x"])).toBe(false);
    expect(await deleteTarget(bob, id)).toBe(false);
    expect((await getTarget(alice, id))?.roleType).toBe("Backend engineer");
  });
});

test("an update reports whether the role type changed", async () => {
  const userId = await createMember("a@example.com");
  const id = await newTarget(userId);
  const same = await updateTarget(userId, id, {
    roleType: "Backend engineer",
    note: "remote please",
  });
  expect(same).toMatchObject({ ok: true, roleTypeChanged: false });
  const changed = await updateTarget(userId, id, { roleType: "Platform engineer" });
  expect(changed).toMatchObject({ ok: true, roleTypeChanged: true });
});

test("hiding unknowns only sticks when the limit is firm", async () => {
  const userId = await createMember("a@example.com");
  const result = await createTarget(userId, {
    roleType: "Barista",
    payIsFirm: false,
    hideUnknownPay: true,
    locationIsFirm: true,
    hideUnknownLocation: true,
  });
  if (!result.ok) throw new Error("target not created");
  const target = await getTarget(userId, result.id);
  expect(target?.hideUnknownPay).toBe(false);
  expect(target?.hideUnknownLocation).toBe(true);
});

test("approved titles are trimmed and de-duplicated, and clear the proposal", async () => {
  const userId = await createMember("a@example.com");
  const id = await newTarget(userId);
  await approveSearchTitles(userId, id, [
    " Backend Engineer ",
    "Backend Engineer",
    "",
    "API Developer",
  ]);
  const target = await getTarget(userId, id);
  expect(target?.searchTitles).toEqual(["Backend Engineer", "API Developer"]);
  expect(target?.searchTitleState).toBe("none");
});

describe("proposing search titles", () => {
  test("stores suggestions for approval, leaving out titles already approved", async () => {
    const userId = await createMember("a@example.com");
    await createItem(userId, { type: "role", title: "Software Developer" });
    const id = await newTarget(userId);
    await approveSearchTitles(userId, id, ["Backend Engineer"]);
    const fake = fakeModel({
      titles: ["Backend Engineer", "Backend Developer", "API Engineer"],
    });
    restore = fake.restore;

    await proposeTitlesForTarget(userId, id);

    const target = await getTarget(userId, id);
    expect(target?.searchTitleState).toBe("proposed");
    expect(target?.proposedSearchTitles).toEqual(["Backend Developer", "API Engineer"]);
    // Approval is still the user's: the searched list is unchanged.
    expect(target?.searchTitles).toEqual(["Backend Engineer"]);
    expect(JSON.stringify(fake.calls[0]?.prompt)).toContain("Software Developer");
  });

  test("a failed suggestion is shown as failed and changes nothing else", async () => {
    const userId = await createMember("a@example.com");
    const id = await newTarget(userId);
    restore = fakeModel({ titles: [] }).restore;
    await proposeTitlesForTarget(userId, id);
    const target = await getTarget(userId, id);
    expect(target?.searchTitleState).toBe("failed");
    expect(target?.searchTitles).toEqual([]);
  });
});

test("a target's label tells same-titled targets apart", () => {
  const base = { roleType: "Software Developer", locations: ["Calgary, AB"] };
  expect(targetLabel({ ...base, workplace: "local_or_remote" })).toBe(
    "Software Developer · Calgary, AB or remote",
  );
  expect(targetLabel({ ...base, workplace: "remote_only" })).toBe(
    "Software Developer · Remote only",
  );
  expect(targetLabel({ ...base, workplace: "local_only" })).toBe(
    "Software Developer · Calgary, AB",
  );
});
