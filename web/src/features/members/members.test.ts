import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { members, session, user } from "@/db/schema";
import { resetDb } from "@/test/db";
import {
  checkSignIn,
  inviteMember,
  isMemberActive,
  linkMemberToUser,
  removeMember,
  suspendMember,
} from "./members";

beforeEach(resetDb);
afterAll(closeDb);

async function signedInMember(email: string) {
  await inviteMember(email);
  const id = `user-${email}`;
  await db().insert(user).values({ id, name: email, email });
  await linkMemberToUser(email, id);
  await db()
    .insert(session)
    .values({ id: `s-${id}`, token: `t-${id}`, userId: id, expiresAt: new Date(Date.now() + 1e7) });
  const [member] = await db().select().from(members).where(eq(members.email, email));
  if (!member) throw new Error("member missing");
  return member;
}

describe("checkSignIn", () => {
  test("refuses an address that was never invited", async () => {
    expect(await checkSignIn("stranger@example.com")).toBe("not_invited");
  });

  test("allows an invited address, ignoring case", async () => {
    await inviteMember("Friend@Example.com");
    expect(await checkSignIn("friend@example.COM")).toBe("allowed");
  });

  test("adds the admin from ADMIN_EMAIL on an empty database", async () => {
    expect(await checkSignIn("Admin@example.com")).toBe("allowed");
    const [admin] = await db().select().from(members);
    expect(admin?.role).toBe("admin");
  });

  test("refuses a suspended member", async () => {
    const member = await signedInMember("friend@example.com");
    await suspendMember(member.id);
    expect(await checkSignIn("friend@example.com")).toBe("suspended");
  });
});

test("first sign-in links the invite to the user and makes it active", async () => {
  const member = await signedInMember("friend@example.com");
  expect(member.state).toBe("active");
  expect(await isMemberActive("user-friend@example.com")).toBe(true);
});

test("suspending a member ends their sessions", async () => {
  const member = await signedInMember("friend@example.com");
  await suspendMember(member.id);
  const sessions = await db()
    .select()
    .from(session)
    .where(eq(session.userId, member.userId ?? ""));
  expect(sessions).toHaveLength(0);
  expect(await isMemberActive("user-friend@example.com")).toBe(false);
});

test("the admin cannot be suspended or removed", async () => {
  await checkSignIn("admin@example.com");
  const [admin] = await db().select().from(members);
  if (!admin) throw new Error("admin missing");
  expect(await suspendMember(admin.id)).toEqual({ ok: false, reason: "is_admin" });
  expect(await removeMember(admin.id)).toEqual({ ok: false, reason: "is_admin" });
});

test("removing a member deletes their user and sessions", async () => {
  const member = await signedInMember("friend@example.com");
  expect(await removeMember(member.id)).toEqual({ ok: true });
  expect(await db().select().from(user)).toHaveLength(0);
  expect(await db().select().from(session)).toHaveLength(0);
});

test("inviting the same address twice is reported, not duplicated", async () => {
  expect(await inviteMember("friend@example.com")).toEqual({ ok: true });
  expect(await inviteMember("FRIEND@example.com")).toEqual({
    ok: false,
    reason: "already_invited",
  });
});
