import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb } from "@/db/client";
import { resetDb } from "@/test/db";
import { useFakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import { parseUpload } from "./parse-upload";
import {
  createItem,
  createUpload,
  deleteItem,
  getUpload,
  listItems,
  moveItem,
  updateItem,
} from "./profile";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

async function addRole(userId: string, title: string) {
  const result = await createItem(userId, { type: "role", title, organization: "Acme" });
  if (!result.ok) throw new Error("role not created");
  return result.id;
}

describe("profile items are scoped to their user", () => {
  test("one user cannot list, change or delete another user's items", async () => {
    const alice = await createMember("alice@example.com");
    const bob = await createMember("bob@example.com");
    const roleId = await addRole(alice, "Engineer");

    expect(await listItems(bob)).toHaveLength(0);
    expect(await updateItem(bob, roleId, { title: "Hacked" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteItem(bob, roleId)).toEqual({ ok: false, reason: "not_found" });
    expect((await listItems(alice))[0]?.title).toBe("Engineer");
  });

  test("a bullet cannot be attached to another user's role", async () => {
    const alice = await createMember("alice@example.com");
    const bob = await createMember("bob@example.com");
    const roleId = await addRole(alice, "Engineer");
    expect(await createItem(bob, { type: "bullet", parentId: roleId, content: "x" })).toEqual({
      ok: false,
      reason: "bad_parent",
    });
  });

  test("another user's upload cannot be read", async () => {
    const alice = await createMember("alice@example.com");
    const bob = await createMember("bob@example.com");
    const uploadId = await createUpload(alice, "cv.pdf", "text");
    expect(await getUpload(bob, uploadId)).toBeUndefined();
  });
});

test("bullets need a role or project as their parent", async () => {
  const userId = await createMember("a@example.com");
  expect((await createItem(userId, { type: "bullet", content: "Did a thing" })).ok).toBe(false);
  const skill = await createItem(userId, { type: "skill", title: "SQL" });
  if (!skill.ok) throw new Error("skill not created");
  expect((await createItem(userId, { type: "bullet", parentId: skill.id, content: "x" })).ok).toBe(
    false,
  );
});

test("moving an item swaps it with its neighbour", async () => {
  const userId = await createMember("a@example.com");
  const first = await addRole(userId, "First");
  await addRole(userId, "Second");
  await moveItem(userId, first, "down");
  expect((await listItems(userId)).map((i) => i.title)).toEqual(["Second", "First"]);
});

test("deleting a role deletes its bullets", async () => {
  const userId = await createMember("a@example.com");
  const roleId = await addRole(userId, "Engineer");
  await createItem(userId, { type: "bullet", parentId: roleId, content: "Shipped it" });
  await deleteItem(userId, roleId);
  expect(await listItems(userId)).toHaveLength(0);
});

describe("parsing an uploaded resume", () => {
  test("saves parsed items with their bullets, marked as from the upload", async () => {
    const userId = await createMember("a@example.com");
    const uploadId = await createUpload(userId, "cv.txt", "Engineer at Acme. Shipped it.");
    restore = useFakeModel({
      items: [
        {
          type: "role",
          title: "Engineer",
          organization: "Acme",
          content: "",
          startDate: "2021",
          endDate: "Present",
          bullets: ["Shipped it"],
        },
        {
          type: "skill",
          title: "SQL",
          organization: "",
          content: "",
          startDate: "",
          endDate: "",
          bullets: [],
        },
      ],
    }).restore;

    await parseUpload(userId, uploadId);

    const items = await listItems(userId);
    expect(items.map((i) => [i.type, i.title || i.content])).toEqual(
      expect.arrayContaining([
        ["role", "Engineer"],
        ["bullet", "Shipped it"],
        ["skill", "SQL"],
      ]),
    );
    expect(items.every((i) => i.source === "upload")).toBe(true);
    expect(await getUpload(userId, uploadId)).toMatchObject({ state: "done", itemsCreated: 3 });
  });

  test("output that fails the schema saves nothing and explains the failure", async () => {
    const userId = await createMember("a@example.com");
    const uploadId = await createUpload(userId, "cv.txt", "text");
    restore = useFakeModel({ items: [{ type: "spaceship" }] }).restore;

    await parseUpload(userId, uploadId);

    expect(await listItems(userId)).toHaveLength(0);
    const upload = await getUpload(userId, uploadId);
    expect(upload?.state).toBe("failed");
    expect(upload?.failure).toMatch(/could not be read reliably/);
  });
});
