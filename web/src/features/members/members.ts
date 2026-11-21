import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { type Member, members, session, user } from "@/db/schema";
import { authEnv } from "@/lib/env";
import { normalizeEmail, type SignInDecision, signInDecision } from "./sign-in-decision";

export type { Member };

/**
 * Decides whether a Google address may sign in. The admin named in ADMIN_EMAIL
 * is added on first sign-in, so the app can be set up from an empty database.
 */
export async function checkSignIn(rawEmail: string | null | undefined): Promise<SignInDecision> {
  if (!rawEmail) return "not_invited";
  const email = normalizeEmail(rawEmail);
  if (email === authEnv().ADMIN_EMAIL) {
    await db()
      .insert(members)
      .values({ email, role: "admin" })
      .onConflictDoUpdate({ target: members.email, set: { role: "admin" } });
  }
  const [member] = await db().select().from(members).where(eq(members.email, email));
  return signInDecision(member);
}

/** Called once Better Auth has created a user: ties the invite to that user. */
export async function linkMemberToUser(rawEmail: string, userId: string): Promise<void> {
  await db()
    .update(members)
    .set({ userId, state: "active", firstSignInAt: sql`now()` })
    .where(eq(members.email, normalizeEmail(rawEmail)));
}

export async function getMemberByUserId(userId: string): Promise<Member | undefined> {
  const [member] = await db().select().from(members).where(eq(members.userId, userId));
  return member;
}

export async function isMemberActive(userId: string): Promise<boolean> {
  const member = await getMemberByUserId(userId);
  return member?.state === "active";
}

export async function listMembers(): Promise<Member[]> {
  return db().select().from(members).orderBy(asc(members.invitedAt));
}

export type InviteResult = { ok: true } | { ok: false; reason: "already_invited" };

export async function inviteMember(rawEmail: string): Promise<InviteResult> {
  const inserted = await db()
    .insert(members)
    .values({ email: normalizeEmail(rawEmail) })
    .onConflictDoNothing()
    .returning({ id: members.id });
  return inserted.length > 0 ? { ok: true } : { ok: false, reason: "already_invited" };
}

export type MemberChangeResult = { ok: true } | { ok: false; reason: "not_found" | "is_admin" };

/** Suspends a member and ends their sessions at once. The admin cannot be suspended. */
export async function suspendMember(memberId: string): Promise<MemberChangeResult> {
  return db().transaction(async (tx) => {
    const [member] = await tx.select().from(members).where(eq(members.id, memberId));
    if (!member) return { ok: false, reason: "not_found" };
    if (member.role === "admin") return { ok: false, reason: "is_admin" };
    await tx.update(members).set({ state: "suspended" }).where(eq(members.id, memberId));
    if (member.userId) await tx.delete(session).where(eq(session.userId, member.userId));
    return { ok: true };
  });
}

export async function reinstateMember(memberId: string): Promise<MemberChangeResult> {
  const [member] = await db().select().from(members).where(eq(members.id, memberId));
  if (!member) return { ok: false, reason: "not_found" };
  await db()
    .update(members)
    .set({ state: member.userId ? "active" : "invited" })
    .where(eq(members.id, memberId));
  return { ok: true };
}

/**
 * Removes a member and, through cascading deletes, everything they own.
 * The admin cannot be removed this way.
 */
export async function removeMember(memberId: string): Promise<MemberChangeResult> {
  return db().transaction(async (tx) => {
    const [member] = await tx.select().from(members).where(eq(members.id, memberId));
    if (!member) return { ok: false, reason: "not_found" };
    if (member.role === "admin") return { ok: false, reason: "is_admin" };
    await tx.delete(members).where(and(eq(members.id, memberId), ne(members.role, "admin")));
    if (member.userId) await tx.delete(user).where(eq(user.id, member.userId));
    return { ok: true };
  });
}

export async function setSpendCap(
  memberId: string,
  spendCapCents: number | null,
): Promise<MemberChangeResult> {
  const updated = await db()
    .update(members)
    .set({ spendCapCents })
    .where(eq(members.id, memberId))
    .returning({ id: members.id });
  return updated.length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}

export type MemberSettingsResult = { ok: true } | { ok: false; reason: "invalid" };

/** A member's own feed settings: notification threshold and target-fit weight. */
export async function updateMemberSettings(
  userId: string,
  settings: { scoreThreshold: number; targetFitWeight: number },
): Promise<MemberSettingsResult> {
  const valid = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100;
  if (!valid(settings.scoreThreshold) || !valid(settings.targetFitWeight)) {
    return { ok: false, reason: "invalid" };
  }
  await db().update(members).set(settings).where(eq(members.userId, userId));
  return { ok: true };
}

/** Records that the member's profile changed in a way that can affect profile fit. */
export async function markProfileChanged(userId: string): Promise<void> {
  await db()
    .update(members)
    .set({ profileChangedAt: sql`now()` })
    .where(eq(members.userId, userId));
}
