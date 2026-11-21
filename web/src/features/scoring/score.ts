import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { jobMatches } from "@/db/schema";
import { runTask } from "@/features/ai/run-task";
import { estimatePay } from "@/features/ai/tasks/estimate-pay";
import { scoreProfileFit } from "@/features/ai/tasks/score-profile-fit";
import { scoreTargetFit } from "@/features/ai/tasks/score-target-fit";
import { memberTaste } from "@/features/feedback/taste";
import {
  type Job,
  jobForPrompt,
  jobsNeedingPayEstimate,
  jobsWithPostings,
  openJobsForMatching,
  savePayEstimate,
} from "@/features/jobs/jobs";
import { allMemberPay, withMemberPay } from "@/features/jobs/member-pay";
import { profileForScoring } from "@/features/profile/for-scoring";
import { titleMatches } from "@/features/sources/match";
import { activeTargets, targetForPrompt } from "@/features/targets/for-scoring";
import type { JobTarget } from "@/features/targets/targets";
import { log } from "@/lib/log";
import { checkFirmLimits } from "./firm-limits";
import { summarizeStrongMatches } from "./summaries";

export type ScoringSummary = {
  payEstimates: number;
  newMatches: number;
  hiddenByFirmLimits: number;
  scored: number;
  failed: number;
  /** New AI summaries written for strong matches. */
  summaries: number;
};

/** Pay estimates are app-level work shared by every member (ADR 0002). */
export async function estimateMissingPay(): Promise<number> {
  let made = 0;
  for (const job of await jobsNeedingPayEstimate()) {
    const result = await runTask(null, estimatePay, { job: jobForPrompt(job, 3000) });
    if (result.ok) {
      await savePayEstimate(job.id, result.output);
      made++;
    }
  }
  return made;
}

/** Whether a job belongs to a target: a search for one of its titles found it, or its title fits. */
export function jobFitsTarget(job: Job & { foundBy: string[] }, target: JobTarget): boolean {
  const titles = target.searchTitles.map((t) => t.trim().toLowerCase());
  return (
    job.foundBy.some((found) => titles.includes(found.trim().toLowerCase())) ||
    titleMatches(job.title, target.searchTitles)
  );
}

/**
 * Creates a match for every open job and active target that belong together and have
 * no match yet. Firm limits are checked here, before any model sees the job.
 */
export async function createMatches(): Promise<{ created: number; hidden: number }> {
  const [jobs, targets, existing] = await Promise.all([
    openJobsForMatching(),
    activeTargets(),
    db().select({ jobId: jobMatches.jobId, targetId: jobMatches.targetId }).from(jobMatches),
  ]);
  const known = new Set(existing.map((m) => `${m.jobId}|${m.targetId}`));
  const memberPay = await allMemberPay(jobs.map((j) => j.id));
  let created = 0;
  let hidden = 0;
  for (const target of targets) {
    for (const job of jobs) {
      if (known.has(`${job.id}|${target.id}`) || !jobFitsTarget(job, target)) continue;
      // A member's own recorded pay counts as known pay for their limits (ADR 0003).
      const limits = checkFirmLimits(
        withMemberPay(job, memberPay.get(`${target.userId}|${job.id}`)),
        target,
      );
      await db()
        .insert(jobMatches)
        .values({
          userId: target.userId,
          jobId: job.id,
          targetId: target.id,
          firmLimitResult: limits.pass ? "pass" : "fail",
          failedLimits: limits.failed,
          unknownFields: limits.unknown,
        })
        .onConflictDoNothing();
      created++;
      if (!limits.pass) hidden++;
    }
  }
  return { created, hidden };
}

/**
 * Scores every match that passed its firm limits and is missing a score. Each
 * member's profile is read once, and each target described once.
 */
export async function scoreUnscoredMatches(
  options: { userId?: string } = {},
): Promise<{ scored: number; failed: number }> {
  const pending = await db()
    .select()
    .from(jobMatches)
    .where(
      and(
        options.userId ? eq(jobMatches.userId, options.userId) : undefined,
        eq(jobMatches.firmLimitResult, "pass"),
        eq(jobMatches.dismissed, false),
        or(isNull(jobMatches.targetScoredAt), isNull(jobMatches.profileScoredAt)),
      ),
    );
  if (pending.length === 0) return { scored: 0, failed: 0 };

  const jobs = new Map(
    (await jobsWithPostings([...new Set(pending.map((m) => m.jobId))])).map((j) => [j.id, j]),
  );
  const targets = new Map((await activeTargets()).map((t) => [t.id, t]));
  const memberPay = await allMemberPay([...jobs.keys()]);
  const profiles = new Map<string, string>();
  const tastes = new Map<string, { preferences: string[]; ratings: string[] }>();
  const tasteFor = async (userId: string) => {
    let taste = tastes.get(userId);
    if (!taste) {
      taste = await memberTaste(userId);
      tastes.set(userId, taste);
    }
    return taste;
  };
  let scored = 0;
  let failed = 0;

  for (const match of pending) {
    const job = jobs.get(match.jobId);
    const target = targets.get(match.targetId);
    if (!job || job.state !== "open" || !target) continue;
    const jobText = jobForPrompt(withMemberPay(job, memberPay.get(`${match.userId}|${job.id}`)));
    const update: Partial<typeof jobMatches.$inferInsert> = {};

    if (!match.targetScoredAt) {
      const result = await runTask(match.userId, scoreTargetFit, {
        target: await (async () => {
          const taste = await tasteFor(match.userId);
          const text = targetForPrompt(target, taste.preferences);
          return taste.ratings.length > 0
            ? `${text}\nJobs they rated recently:\n${taste.ratings.join("\n")}`
            : text;
        })(),
        job: jobText,
      });
      if (result.ok) {
        update.targetFit = result.output.score;
        update.targetFitReason = result.output.reason;
        update.targetScoredAt = new Date();
      }
    }
    if (!match.profileScoredAt) {
      let profile = profiles.get(match.userId);
      if (profile === undefined) {
        profile = await profileForScoring(match.userId);
        profiles.set(match.userId, profile);
      }
      const result = await runTask(match.userId, scoreProfileFit, { profile, job: jobText });
      if (result.ok) {
        update.profileFit = result.output.score;
        update.profileFitReason = result.output.reason;
        update.profileScoredAt = new Date();
      }
    }

    if (Object.keys(update).length > 0) {
      await db().update(jobMatches).set(update).where(eq(jobMatches.id, match.id));
    }
    const complete =
      (match.targetScoredAt || update.targetScoredAt) &&
      (match.profileScoredAt || update.profileScoredAt);
    if (complete) scored++;
    else failed++;
  }
  return { scored, failed };
}

/** Everything that happens after a daily run, in order. */
export async function scoreAfterRun(): Promise<ScoringSummary> {
  const payEstimates = await estimateMissingPay();
  const matches = await createMatches();
  const scoring = await scoreUnscoredMatches();
  // Summaries come last: they need the new scores to know which matches are strong.
  const summaries = await summarizeStrongMatches().catch((err: unknown) => {
    log.error({ err }, "match summaries failed");
    return { written: 0, failed: 0 };
  });
  const summary = {
    payEstimates,
    newMatches: matches.created,
    hiddenByFirmLimits: matches.hidden,
    ...scoring,
    summaries: summaries.written,
  };
  log.info(summary, "scoring finished");
  return summary;
}
