import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jobMatches, rescoreRequests } from "@/db/schema";
import { getSettings } from "@/features/admin/settings";
import { jobIdsWithApplications } from "@/features/applications/applications";
import { jobsWithPostings, openJobIds } from "@/features/jobs/jobs";
import { getMemberByUserId } from "@/features/members/members";
import { localDate } from "@/features/runs/time";
import { getTarget, listTargets } from "@/features/targets/targets";
import { checkFirmLimits } from "./firm-limits";
import { scoreUnscoredMatches } from "./score";

/**
 * Rescoring (CLAUDE.md rule 5): saving a change never triggers scoring. When the
 * profile or a target changed after a live match was scored, the member gets a
 * button; it re-runs only the affected score, within the admin's daily limit.
 */

type StaleMatch = { id: string; profile: boolean; target: boolean };

/** Live matches (passing, not dismissed, job open) whose scores predate a change. */
async function staleMatches(userId: string): Promise<StaleMatch[]> {
  const [member, targets] = await Promise.all([getMemberByUserId(userId), listTargets(userId)]);
  const targetChanged = new Map(targets.map((t) => [t.id, t.scoringChangedAt]));
  const matches = await db()
    .select()
    .from(jobMatches)
    .where(
      and(
        eq(jobMatches.userId, userId),
        eq(jobMatches.firmLimitResult, "pass"),
        eq(jobMatches.dismissed, false),
      ),
    );
  const [open, tracked] = await Promise.all([
    openJobIds([...new Set(matches.map((m) => m.jobId))]),
    jobIdsWithApplications(userId),
  ]);
  const profileChangedAt = member?.profileChangedAt ?? null;
  return matches.flatMap((match) => {
    // A live match: job open, not dismissed, and no application yet.
    if (!open.has(match.jobId) || tracked.has(match.jobId)) return [];
    // Learned preferences feed target fit, so a change to them makes it stale too.
    const targetChangedAt = targetChanged.get(match.targetId) ?? null;
    const preferencesChangedAt = member?.preferencesChangedAt ?? null;
    const changedAt =
      targetChangedAt && preferencesChangedAt
        ? new Date(Math.max(targetChangedAt.getTime(), preferencesChangedAt.getTime()))
        : (targetChangedAt ?? preferencesChangedAt);
    const profile = Boolean(
      profileChangedAt && match.profileScoredAt && match.profileScoredAt < profileChangedAt,
    );
    const target = Boolean(changedAt && match.targetScoredAt && match.targetScoredAt < changedAt);
    return profile || target ? [{ id: match.id, profile, target }] : [];
  });
}

/** Rescores used today, counting by the Calgary calendar date. */
async function usedToday(userId: string, now: Date): Promise<number> {
  const rows = await db()
    .select({ createdAt: rescoreRequests.createdAt })
    .from(rescoreRequests)
    .where(
      and(
        eq(rescoreRequests.userId, userId),
        gte(rescoreRequests.createdAt, new Date(now.getTime() - 2 * 86_400_000)),
      ),
    );
  const today = localDate(now);
  return rows.filter((r) => localDate(r.createdAt) === today).length;
}

export type RescoreStatus = {
  staleProfile: number;
  staleTarget: number;
  usedToday: number;
  limitPerDay: number;
  running: boolean;
};

export async function rescoreStatus(
  userId: string,
  now: Date = new Date(),
): Promise<RescoreStatus> {
  const [stale, used, settings, [active]] = await Promise.all([
    staleMatches(userId),
    usedToday(userId, now),
    getSettings(),
    db()
      .select({ n: count() })
      .from(rescoreRequests)
      .where(
        and(
          eq(rescoreRequests.userId, userId),
          isNull(rescoreRequests.finishedAt),
          // A request that never finished within an hour is treated as dead.
          gte(rescoreRequests.createdAt, sql`now() - interval '1 hour'`),
        ),
      ),
  ]);
  return {
    staleProfile: stale.filter((s) => s.profile).length,
    staleTarget: stale.filter((s) => s.target).length,
    usedToday: used,
    limitPerDay: settings.rescoreLimitPerDay,
    running: (active?.n ?? 0) > 0,
  };
}

export type RequestResult =
  | { ok: true; requestId: string }
  | { ok: false; reason: "nothing_changed" | "limit_reached" | "already_running" };

/** Records a rescore if one is allowed; the worker does the scoring. */
export async function requestRescore(
  userId: string,
  now: Date = new Date(),
): Promise<RequestResult> {
  const status = await rescoreStatus(userId, now);
  if (status.running) return { ok: false, reason: "already_running" };
  if (status.staleProfile + status.staleTarget === 0)
    return { ok: false, reason: "nothing_changed" };
  if (status.usedToday >= status.limitPerDay) return { ok: false, reason: "limit_reached" };
  const [request] = await db()
    .insert(rescoreRequests)
    .values({ userId })
    .returning({ id: rescoreRequests.id });
  if (!request) throw new Error("rescore request insert returned no row");
  return { ok: true, requestId: request.id };
}

/** Worker job: clears only the stale scores, then scores them again. */
export async function runRescore(userId: string, requestId: string): Promise<{ scored: number }> {
  const stale = await staleMatches(userId);
  const profileIds = stale.filter((s) => s.profile).map((s) => s.id);
  const targetIds = stale.filter((s) => s.target).map((s) => s.id);
  // Old scores stay visible until the new ones arrive; only the timestamps are cleared.
  if (profileIds.length > 0) {
    await db()
      .update(jobMatches)
      .set({ profileScoredAt: null })
      .where(inArray(jobMatches.id, profileIds));
  }
  if (targetIds.length > 0) {
    await db()
      .update(jobMatches)
      .set({ targetScoredAt: null })
      .where(inArray(jobMatches.id, targetIds));
  }
  const { scored } = await scoreUnscoredMatches({ userId });
  await db()
    .update(rescoreRequests)
    .set({ finishedAt: sql`now()` })
    .where(and(eq(rescoreRequests.id, requestId), eq(rescoreRequests.userId, userId)));
  return { scored };
}

/**
 * After a target's firm limits change, re-checks its matches straight away. No model
 * is involved: newly passing matches are scored in the next run or rescore.
 */
export async function refilterTarget(userId: string, targetId: string): Promise<number> {
  const target = await getTarget(userId, targetId);
  if (!target) return 0;
  const matches = await db()
    .select()
    .from(jobMatches)
    .where(and(eq(jobMatches.userId, userId), eq(jobMatches.targetId, targetId)));
  const jobs = new Map((await jobsWithPostings(matches.map((m) => m.jobId))).map((j) => [j.id, j]));
  let changed = 0;
  for (const match of matches) {
    const job = jobs.get(match.jobId);
    if (!job) continue;
    const limits = checkFirmLimits(job, target);
    const result = limits.pass ? "pass" : "fail";
    if (
      result !== match.firmLimitResult ||
      limits.failed.join() !== match.failedLimits.join() ||
      limits.unknown.join() !== match.unknownFields.join()
    ) {
      await db()
        .update(jobMatches)
        .set({
          firmLimitResult: result,
          failedLimits: limits.failed,
          unknownFields: limits.unknown,
        })
        .where(eq(jobMatches.id, match.id));
      changed++;
    }
  }
  return changed;
}
