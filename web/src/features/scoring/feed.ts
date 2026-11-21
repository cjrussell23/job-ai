import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { type JobMatch, jobMatches } from "@/db/schema";
import { type JobWithPostings, jobsWithPostings } from "@/features/jobs/jobs";
import { listTargets } from "@/features/targets/targets";
import { combinedScore } from "./firm-limits";

export type FeedItem = {
  job: JobWithPostings;
  /** The match with the highest combined score; its target is shown first. */
  best: JobMatch & { targetName: string; combined: number | null };
  /** Other targets this job also matched. */
  otherTargets: string[];
};

/**
 * A member's feed: open jobs that passed a target's firm limits and were not
 * dismissed, best match first. Everything here is filtered by the member's id.
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
  const [jobs, targets] = await Promise.all([
    jobsWithPostings([...new Set(matches.map((m) => m.jobId))]),
    listTargets(userId),
  ]);
  const targetName = new Map(targets.map((t) => [t.id, t.roleType]));
  const openJobs = new Map(jobs.filter((j) => j.state === "open").map((j) => [j.id, j]));

  const byJob = new Map<string, (JobMatch & { targetName: string; combined: number | null })[]>();
  for (const match of matches) {
    if (!openJobs.has(match.jobId) || !targetName.has(match.targetId)) continue;
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
    items.push({ job, best, otherTargets: others.map((o) => o.targetName) });
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
