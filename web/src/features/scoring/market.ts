import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobMatches } from "@/db/schema";
import { type JobWithPostings, jobsWithPostings } from "@/features/jobs/jobs";
import { memberPayFor, withMemberPay } from "@/features/jobs/member-pay";
import type { JobTarget } from "@/features/targets/targets";
import { checkFirmLimits, type JobFacts, type TargetLimits } from "./firm-limits";

export type Loosening =
  | "pay_preference"
  | "location_preference"
  | "show_unknown_pay"
  | "show_unknown_location"
  | "lower_pay";

export type MarketView = {
  passing: number;
  /** Only loosenings that would add jobs, most first. */
  options: { kind: Loosening; added: number }[];
};

/** The target settings each loosening would use. Only limits that are firm today can loosen. */
function loosened(target: TargetLimits): [Loosening, TargetLimits][] {
  const options: [Loosening, TargetLimits][] = [];
  if (target.payIsFirm) {
    options.push(["pay_preference", { ...target, payIsFirm: false }]);
    if (target.hideUnknownPay)
      options.push(["show_unknown_pay", { ...target, hideUnknownPay: false }]);
    if (target.minPayCents !== null)
      options.push(["lower_pay", { ...target, minPayCents: Math.round(target.minPayCents * 0.9) }]);
  }
  if (target.locationIsFirm) {
    options.push(["location_preference", { ...target, locationIsFirm: false }]);
    if (target.hideUnknownLocation)
      options.push(["show_unknown_location", { ...target, hideUnknownLocation: false }]);
  }
  return options;
}

/**
 * Real counts for widening a target: firm limits rechecked against the jobs already
 * found for it, under each loosened setting. Pure, so no model call is involved.
 */
export function wideningCounts(jobs: JobFacts[], target: TargetLimits): MarketView {
  const count = (limits: TargetLimits) =>
    jobs.filter((job) => checkFirmLimits(job, limits).pass).length;
  const passing = count(target);
  const options = loosened(target)
    .map(([kind, limits]) => ({ kind, added: count(limits) - passing }))
    .filter((o) => o.added > 0)
    .sort((a, b) => b.added - a.added);
  return { passing, options };
}

/** Widening counts for each of the member's targets, over open jobs found for that target. */
export async function marketForTargets(
  userId: string,
  targets: JobTarget[],
): Promise<Map<string, MarketView>> {
  const matches = await db()
    .select({ jobId: jobMatches.jobId, targetId: jobMatches.targetId })
    .from(jobMatches)
    .where(eq(jobMatches.userId, userId));
  const jobIds = [...new Set(matches.map((m) => m.jobId))];
  const [found, pay] = await Promise.all([jobsWithPostings(jobIds), memberPayFor(userId, jobIds)]);
  const jobs = new Map(
    found.filter((j) => j.state === "open").map((j) => [j.id, withMemberPay(j, pay.get(j.id))]),
  );
  const views = new Map<string, MarketView>();
  for (const target of targets) {
    const pool = matches
      .filter((m) => m.targetId === target.id)
      .map((m) => jobs.get(m.jobId))
      .filter((j): j is JobWithPostings => j !== undefined);
    views.set(target.id, wideningCounts(pool, target));
  }
  return views;
}
