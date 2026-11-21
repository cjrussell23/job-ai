import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { type JobTarget, jobTargets } from "@/db/schema";
import { parsePlace, placeLabel } from "@/lib/places";

export type { JobTarget };

const titleList = z.array(z.string().trim().min(1).max(100)).max(20);

export const targetInputSchema = z
  .object({
    roleType: z.string().trim().min(1).max(200),
    // Each place is a city, province or country, stored in its canonical form.
    locations: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(100)
          .transform((text, ctx) => {
            const place = parsePlace(text);
            if (!place) {
              ctx.addIssue({ code: "custom", message: `"${text}" isn't a place we can search.` });
              return z.NEVER;
            }
            return placeLabel(place);
          }),
      )
      .max(10)
      .default([])
      .transform((places) => [...new Set(places)]),
    workplace: z.enum(["remote_only", "local_or_remote", "local_only"]).default("local_or_remote"),
    locationIsFirm: z.boolean().default(false),
    hideUnknownLocation: z.boolean().default(false),
    minPayCents: z.int().min(0).nullable().default(null),
    payBasis: z.enum(["hourly", "annual"]).default("annual"),
    desiredHours: z.int().min(1).max(80).nullable().default(null),
    payIsFirm: z.boolean().default(false),
    hideUnknownPay: z.boolean().default(false),
    note: z.string().trim().max(2000).default(""),
  })
  // "Hide unknowns" only means something for a firm limit.
  .transform((t) => ({
    ...t,
    hideUnknownLocation: t.locationIsFirm && t.hideUnknownLocation,
    hideUnknownPay: t.payIsFirm && t.hideUnknownPay,
  }));
export type TargetInput = z.input<typeof targetInputSchema>;

export type TargetResult =
  | { ok: true; id: string; roleTypeChanged: boolean }
  | { ok: false; reason: "not_found" | "invalid" };

export async function listTargets(userId: string): Promise<JobTarget[]> {
  return db()
    .select()
    .from(jobTargets)
    .where(eq(jobTargets.userId, userId))
    .orderBy(asc(jobTargets.createdAt));
}

export async function getTarget(userId: string, targetId: string): Promise<JobTarget | undefined> {
  const [target] = await db()
    .select()
    .from(jobTargets)
    .where(and(eq(jobTargets.id, targetId), eq(jobTargets.userId, userId)));
  return target;
}

export async function createTarget(
  userId: string,
  raw: TargetInput | Record<string, unknown>,
): Promise<TargetResult> {
  const parsed = targetInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const [created] = await db()
    .insert(jobTargets)
    .values({ ...parsed.data, userId })
    .returning({ id: jobTargets.id });
  if (!created) return { ok: false, reason: "invalid" };
  return { ok: true, id: created.id, roleTypeChanged: true };
}

export async function updateTarget(
  userId: string,
  targetId: string,
  raw: TargetInput | Record<string, unknown>,
): Promise<TargetResult> {
  const parsed = targetInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const existing = await getTarget(userId, targetId);
  if (!existing) return { ok: false, reason: "not_found" };
  await db()
    .update(jobTargets)
    .set({ ...parsed.data, updatedAt: sql`now()`, scoringChangedAt: sql`now()` })
    .where(and(eq(jobTargets.id, targetId), eq(jobTargets.userId, userId)));
  return {
    ok: true,
    id: targetId,
    roleTypeChanged: existing.roleType.trim() !== parsed.data.roleType,
  };
}

export async function setTargetActive(
  userId: string,
  targetId: string,
  active: boolean,
): Promise<boolean> {
  const updated = await db()
    .update(jobTargets)
    .set({ active, updatedAt: sql`now()` })
    .where(and(eq(jobTargets.id, targetId), eq(jobTargets.userId, userId)))
    .returning({ id: jobTargets.id });
  return updated.length > 0;
}

export async function deleteTarget(userId: string, targetId: string): Promise<boolean> {
  const deleted = await db()
    .delete(jobTargets)
    .where(and(eq(jobTargets.id, targetId), eq(jobTargets.userId, userId)))
    .returning({ id: jobTargets.id });
  return deleted.length > 0;
}

/** Saves the user's edited list as the titles that will be searched. */
export async function approveSearchTitles(
  userId: string,
  targetId: string,
  titles: string[],
): Promise<boolean> {
  const parsed = titleList.safeParse([...new Set(titles.map((t) => t.trim()).filter(Boolean))]);
  if (!parsed.success) return false;
  const updated = await db()
    .update(jobTargets)
    .set({
      searchTitles: parsed.data,
      proposedSearchTitles: [],
      searchTitleState: "none",
      updatedAt: sql`now()`,
    })
    .where(and(eq(jobTargets.id, targetId), eq(jobTargets.userId, userId)))
    .returning({ id: jobTargets.id });
  return updated.length > 0;
}

export async function setSearchTitleProposal(
  userId: string,
  targetId: string,
  proposal: { state: "proposing" | "failed" } | { state: "proposed"; titles: string[] },
): Promise<void> {
  await db()
    .update(jobTargets)
    .set(
      proposal.state === "proposed"
        ? { searchTitleState: "proposed", proposedSearchTitles: proposal.titles }
        : { searchTitleState: proposal.state, proposedSearchTitles: [] },
    )
    .where(and(eq(jobTargets.id, targetId), eq(jobTargets.userId, userId)));
}

/**
 * Searches wanted by every member's active targets, for the daily run. Only titles,
 * places and the remote setting leave this feature: nothing that identifies a member.
 */
export async function activeTargetSearches(): Promise<
  Pick<JobTarget, "searchTitles" | "locations" | "workplace">[]
> {
  const rows = await db()
    .select({
      searchTitles: jobTargets.searchTitles,
      locations: jobTargets.locations,
      workplace: jobTargets.workplace,
    })
    .from(jobTargets)
    .where(eq(jobTargets.active, true));
  return rows.filter((r) => r.searchTitles.length > 0);
}

/** A short name telling targets apart, e.g. "Software Developer · Calgary, AB or remote". */
export function targetLabel(
  target: Pick<JobTarget, "roleType" | "workplace" | "locations">,
): string {
  const places = target.locations.join(", ");
  const where =
    target.workplace === "remote_only"
      ? "Remote only"
      : `${places || "Anywhere"}${target.workplace === "local_or_remote" ? " or remote" : ""}`;
  return `${target.roleType} · ${where}`;
}
