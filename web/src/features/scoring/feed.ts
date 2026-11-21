import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { type JobMatch, jobMatches } from "@/db/schema";
import { jobIdsWithApplications } from "@/features/applications/applications";
import { type JobWithPostings, jobsWithPostings } from "@/features/jobs/jobs";
import { memberPayFor, withMemberPay } from "@/features/jobs/member-pay";
import { listTargets } from "@/features/targets/targets";
import { combinedScore } from "./firm-limits";

export type FeedItem = {
  job: JobWithPostings & { memberPay?: "entered" | "confirmed_estimate" };
  /** The match with the highest combined score; its target is shown first. */
  best: JobMatch & { targetName: string; combined: number | null };
  /** Other targets this job also matched. */
  otherTargets: string[];
  otherTargetIds: string[];
};

/**
 * A member's feed: open jobs that passed a target's firm limits and were not
 * dismissed or already tracked, best match first. Everything here is filtered by the member's id.
 */
export async function feedForUser(userId: string, targetFitWeight: number): Promise<FeedItem[]> {
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
  if (matches.length === 0) return [];
  const jobIds = [...new Set(matches.map((m) => m.jobId))];
  const [found, targets, tracked, pay] = await Promise.all([
    jobsWithPostings(jobIds),
    listTargets(userId),
    jobIdsWithApplications(userId),
    memberPayFor(userId, jobIds),
  ]);
  const jobs = found.map((j) => withMemberPay(j, pay.get(j.id)));
  const targetName = new Map(targets.map((t) => [t.id, t.roleType]));
  const openJobs = new Map(jobs.filter((j) => j.state === "open").map((j) => [j.id, j]));

  const byJob = new Map<string, (JobMatch & { targetName: string; combined: number | null })[]>();
  for (const match of matches) {
    // A saved or applied job lives on the board, not the feed (rule 11).
    if (!openJobs.has(match.jobId) || !targetName.has(match.targetId) || tracked.has(match.jobId))
      continue;
    const entry = {
      ...match,
      targetName: targetName.get(match.targetId) ?? "",
      combined: combinedScore(match.targetFit, match.profileFit, targetFitWeight),
    };
    byJob.set(match.jobId, [...(byJob.get(match.jobId) ?? []), entry]);
  }

  const items: FeedItem[] = [];
  for (const [jobId, jobMatchList] of byJob) {
    const job = openJobs.get(jobId);
    if (!job) continue;
    const sorted = jobMatchList.sort((a, b) => (b.combined ?? -1) - (a.combined ?? -1));
    const [best, ...others] = sorted;
    if (!best) continue;
    items.push({
      job,
      best,
      otherTargets: others.map((o) => o.targetName),
      otherTargetIds: others.map((o) => o.targetId),
    });
  }
  // Scored jobs first by combined score, then unscored ones, newest first.
  return items.sort(
    (a, b) =>
      (b.best.combined ?? -1) - (a.best.combined ?? -1) ||
      b.job.firstSeenAt.getTime() - a.job.firstSeenAt.getTime(),
  );
}

/** Hides a job from the member's feed, for every target it matched. */
export async function dismissJob(userId: string, jobId: string): Promise<void> {
  await db()
    .update(jobMatches)
    .set({ dismissed: true })
    .where(and(eq(jobMatches.userId, userId), eq(jobMatches.jobId, jobId)));
}

export type BestMatch = JobMatch & { targetName: string; combined: number | null };

/** The best match per job for jobs the member is tracking, whether or not they're still in the feed. */
export async function bestMatchesForJobs(
  userId: string,
  jobIds: string[],
  targetFitWeight: number,
): Promise<Map<string, BestMatch>> {
  if (jobIds.length === 0) return new Map();
  const [matches, targets] = await Promise.all([
    db()
      .select()
      .from(jobMatches)
      .where(and(eq(jobMatches.userId, userId), inArray(jobMatches.jobId, jobIds))),
    listTargets(userId),
  ]);
  const targetName = new Map(targets.map((t) => [t.id, t.roleType]));
  const best = new Map<string, BestMatch>();
  for (const match of matches) {
    const entry = {
      ...match,
      targetName: targetName.get(match.targetId) ?? "Removed target",
      combined: combinedScore(match.targetFit, match.profileFit, targetFitWeight),
    };
    const current = best.get(match.jobId);
    if (!current || (entry.combined ?? -1) > (current.combined ?? -1)) best.set(match.jobId, entry);
  }
  return best;
}
