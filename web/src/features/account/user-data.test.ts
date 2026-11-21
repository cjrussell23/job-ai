import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { aiUsage, members, session } from "@/db/schema";
import { checkSignIn } from "@/features/members/members";
import { createItem, createUpload } from "@/features/profile/profile";
import { createTarget } from "@/features/targets/targets";
import { resetDb } from "@/test/db";
import { createMember } from "@/test/fixtures";
import { deleteUserData, exportUserData, userOwnedTables } from "./user-data";

beforeEach(resetDb);
afterAll(closeDb);

async function tablesWithUserId(): Promise<string[]> {
  const rows = await db().execute<{ table_name: string }>(sql`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'user_id'
    order by table_name`);
  return rows.map((r) => r.table_name);
}

async function seed(userId: string) {
  const role = await createItem(userId, { type: "role", title: "Engineer" });
  if (!role.ok) throw new Error("seed failed");
  await createItem(userId, { type: "bullet", parentId: role.id, content: "Shipped it" });
  await createUpload(userId, "cv.txt", "resume text");
  await createTarget(userId, { roleType: "Engineer" });
  await db().insert(aiUsage).values({
    userId,
    task: "parseResume",
    model: "claude-haiku-5-5",
    promptVersion: "v1",
    inputTokens: 10,
    outputTokens: 10,
    costUsd: 0.001,
  });
  await db()
    .insert(session)
    .values({
      id: `s-${userId}`,
      token: `secret-token-${userId}`,
      userId,
      expiresAt: new Date(Date.now() + 1e7),
    });
}

describe("the list of user-owned tables", () => {
  test("covers every table with a user_id column", async () => {
    for (const table of await tablesWithUserId()) {
      expect(Object.keys(userOwnedTables), `${table} is missing from userOwnedTables`).toContain(
        table,
      );
    }
  });

  test("every user_id column cascades from the user table, so deletion reaches it", async () => {
    const rows = await db().execute<{ table_name: string; delete_rule: string }>(sql`
      select tc.table_name, rc.delete_rule
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
      join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'user_id'`);
    const rules = new Map(rows.map((r) => [r.table_name, r.delete_rule]));
    for (const table of await tablesWithUserId()) {
      expect(rules.get(table), `${table}.user_id must cascade on delete`).toBe("CASCADE");
    }
  });
});

test("deleting a member removes all their rows and none of anyone else's", async () => {
  const alice = await createMember("alice@example.com");
  const bob = await createMember("bob@example.com");
  await seed(alice);
  await seed(bob);

  const countRows = async (table: string, userId: string) => {
    const [row] = await db().execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(table)} where user_id = ${userId}`,
    );
    return row?.n ?? 0;
  };
  const tables = await tablesWithUserId();
  const bobBefore = await Promise.all(tables.map((t) => countRows(t, bob)));

  expect(await deleteUserData(alice)).toEqual({ ok: true });

  for (const [i, table] of tables.entries()) {
    expect(await countRows(table, alice), `${table} still has rows for the deleted member`).toBe(0);
    expect(await countRows(table, bob), `${table} changed rows of another member`).toBe(
      bobBefore[i],
    );
  }
  const [remaining] = await db().execute<{ n: number }>(
    sql`select count(*)::int as n from "user" where id = ${alice}`,
  );
  expect(remaining?.n).toBe(0);
});

test("the only admin cannot delete their own account", async () => {
  await checkSignIn("admin@example.com");
  const adminId = await createMember("helper@example.com");
  await db().update(members).set({ userId: null }).where(sql`email = 'helper@example.com'`);
  await db().update(members).set({ userId: adminId }).where(sql`email = 'admin@example.com'`);
  expect(await deleteUserData(adminId)).toEqual({ ok: false, reason: "only_admin" });
});

test("the export holds the member's data, no one else's, and no sign-in tokens", async () => {
  const alice = await createMember("alice@example.com");
  const bob = await createMember("bob@example.com");
  await seed(alice);
  await seed(bob);

  const data = await exportUserData(alice);
  const text = JSON.stringify(data);

  expect(data.account.email).toBe("alice@example.com");
  expect(data.profileItems).toHaveLength(2);
  expect(data.resumeUploads).toHaveLength(1);
  expect(data.jobTargets).toHaveLength(1);
  expect(data.aiUsage).toHaveLength(1);
  expect(text).not.toContain("secret-token");
  expect(text).not.toContain(bob);
});
