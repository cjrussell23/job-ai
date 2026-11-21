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

const memberPayLabels = { entered: "you entered", confirmed_estimate: "estimate you confirmed" };

/** How a job's pay reads: the member's own, stated, an estimate (always labelled), or unknown. */
export function payText(job: Job & { memberPay?: "entered" | "confirmed_estimate" }): string {
  if (job.payPeriod) {
    const label = job.memberPay ? ` (${memberPayLabels[job.memberPay]})` : "";
    return `${range(job.payMin, job.payMax)} per ${job.payPeriod}${label}`;
  }
  if (job.payEstimatePeriod && job.payEstimateCertainty) {
    return `unknown (estimated ${range(job.payEstimateMin, job.payEstimateMax)} per ${job.payEstimatePeriod}, ${job.payEstimateCertainty} certainty)`;
  }
  return "unknown";
}

/** A job as a model reads it. Descriptions are cut to keep prompts small. */
export function jobForPrompt(
  job: Job & { memberPay?: "entered" | "confirmed_estimate" },
  maxDescription = 6000,
): string {
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

/** Which of these jobs are still open. */
export async function openJobIds(jobIds: string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const rows = await db()
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(inArray(jobs.id, jobIds), eq(jobs.state, "open")));
  return new Set(rows.map((r) => r.id));
}

/** When a job was first advertised: the earliest date any of its postings gives, if any. */
export function postedAt(job: { postings: Pick<Posting, "postedAt">[] }): Date | null {
  const dates = job.postings
    .map((p) => p.postedAt)
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime());
  return dates.length ? new Date(Math.min(...dates)) : null;
}

/** Dollar amounts in a piece of text, as full numbers: "$195K" -> 195000. */
function amountsIn(text: string): number[] {
  return [...text.matchAll(/(\d{1,3}(?:[,\s]\d{3})+|\d+(?:\.\d+)?)\s*(k)?\b/gi)].map((m) => {
    const value = Number((m[1] ?? "").replace(/[,\s]/g, ""));
    return m[2] ? value * 1000 : value;
  });
}

const squash = (text: string) =>
  text.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Whether pay a model read from a description is really there: its quote appears in the
 * description and holds both figures. Anything else is treated as not stated (rule 1).
 */
export function statedPayChecks(
  description: string,
  stated: { min: number; max: number; quote: string },
): boolean {
  const quote = squash(stated.quote);
  if (quote.length < 6 || !squash(description).includes(quote)) return false;
  const amounts = amountsIn(stated.quote);
  const near = (want: number) =>
    amounts.some((a) => Math.abs(a - want) <= Math.max(1, want * 0.001));
  return near(stated.min) && near(stated.max);
}

export async function saveStatedPay(
  jobId: string,
  pay: { min: number; max: number; period: "hour" | "day" | "week" | "month" | "year" },
): Promise<void> {
  await db()
    .update(jobs)
    .set({
      payMin: pay.min,
      payMax: pay.max,
      payPeriod: pay.period,
      payStatedIn: "description",
      // Stated pay replaces any guess.
      payEstimateMin: null,
      payEstimateMax: null,
      payEstimatePeriod: null,
      payEstimateCertainty: null,
      payEstimateReason: null,
    })
    .where(and(eq(jobs.id, jobId), isNull(jobs.payPeriod)));
}
