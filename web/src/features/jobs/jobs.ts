import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { type Job, jobs, type Posting, postings } from "@/db/schema";

export type { Job, Posting };
export type JobWithPostings = Job & { postings: Posting[] };

/** Open jobs with the search titles that found their postings, for matching to targets. */
export async function openJobsForMatching(): Promise<(Job & { foundBy: string[] })[]> {
  const rows = await db()
    .select({ job: jobs, foundBy: postings.foundBy })
    .from(jobs)
    .innerJoin(postings, eq(postings.jobId, jobs.id))
    .where(eq(jobs.state, "open"));
  const byId = new Map<string, Job & { foundBy: string[] }>();
  for (const row of rows) {
    const entry = byId.get(row.job.id) ?? { ...row.job, foundBy: [] };
    if (row.foundBy) entry.foundBy.push(row.foundBy);
    byId.set(row.job.id, entry);
  }
  return [...byId.values()];
}

export async function jobsWithPostings(jobIds: string[]): Promise<JobWithPostings[]> {
  if (jobIds.length === 0) return [];
  const [jobRows, postingRows] = await Promise.all([
    db().select().from(jobs).where(inArray(jobs.id, jobIds)),
    db().select().from(postings).where(inArray(postings.jobId, jobIds)),
  ]);
  return jobRows.map((job) => ({
    ...job,
    postings: postingRows.filter((p) => p.jobId === job.id),
  }));
}

/** Open jobs that state no pay and have no estimate yet. */
export async function jobsNeedingPayEstimate(limit = 200): Promise<Job[]> {
  return db()
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.state, "open"),
        isNull(jobs.payPeriod),
        isNull(jobs.payEstimateCertainty),
        ne(jobs.description, ""),
      ),
    )
    .limit(limit);
}

export type PayEstimate = {
  min: number;
  max: number;
  period: "hour" | "year";
  certainty: "low" | "medium" | "high";
  reason: string;
};

export async function savePayEstimate(jobId: string, estimate: PayEstimate): Promise<void> {
  await db()
    .update(jobs)
    .set({
      payEstimateMin: estimate.min,
      payEstimateMax: estimate.max,
      payEstimatePeriod: estimate.period,
      payEstimateCertainty: estimate.certainty,
      payEstimateReason: estimate.reason,
    })
    .where(eq(jobs.id, jobId));
}

const money = (n: number) => `$${n.toLocaleString("en-CA", { maximumFractionDigits: 2 })}`;

function range(min: number | null, max: number | null): string {
  if (min === null && max === null) return "";
  if (min === null || max === null || min === max) return money(min ?? max ?? 0);
  return `${money(min)}–${money(max)}`;
}

/** How a job's pay reads: stated, an estimate (always labelled), or unknown. */
export function payText(job: Job): string {
  if (job.payPeriod) return `${range(job.payMin, job.payMax)} per ${job.payPeriod}`;
  if (job.payEstimatePeriod && job.payEstimateCertainty) {
    return `unknown (estimated ${range(job.payEstimateMin, job.payEstimateMax)} per ${job.payEstimatePeriod}, ${job.payEstimateCertainty} certainty)`;
  }
  return "unknown";
}

/** A job as a model reads it. Descriptions are cut to keep prompts small. */
export function jobForPrompt(job: Job, maxDescription = 6000): string {
  const lines = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location || "not stated"}`,
    `Workplace: ${job.remote === "unknown" ? "not stated" : job.remote}`,
    `Pay: ${payText(job)}`,
  ];
  if (job.hoursPerWeek) lines.push(`Hours: ${job.hoursPerWeek} per week`);
  lines.push("", job.description.slice(0, maxDescription) || "(no description)");
  return lines.join("\n");
}
