import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { type Job, jobs, type MemberJobPay, memberJobPay } from "@/db/schema";

export type { MemberJobPay };

/** A job as one member sees it: their own recorded pay, if any, stands in for stated pay. */
export type JobForMember = Job & { memberPay?: MemberJobPay["source"] };

/**
 * Pure: the job with the member's recorded pay in place of stated pay (ADR 0003). Firm
 * limits and prompts then treat it as known pay; `memberPay` keeps it labelled.
 */
export function withMemberPay<T extends Job>(
  job: T,
  pay: Pick<MemberJobPay, "payMin" | "payMax" | "payPeriod" | "source"> | undefined,
): T & { memberPay?: MemberJobPay["source"] } {
  if (!pay) return job;
  return {
    ...job,
    payMin: pay.payMin,
    payMax: pay.payMax,
    payPeriod: pay.payPeriod,
    memberPay: pay.source,
  };
}

export async function memberPayFor(
  userId: string,
  jobIds: string[],
): Promise<Map<string, MemberJobPay>> {
  if (jobIds.length === 0) return new Map();
  const rows = await db()
    .select()
    .from(memberJobPay)
    .where(and(eq(memberJobPay.userId, userId), inArray(memberJobPay.jobId, jobIds)));
  return new Map(rows.map((r) => [r.jobId, r]));
}

/** Every member's recorded pay, keyed "userId|jobId", for the daily matching pass. */
export async function allMemberPay(jobIds: string[]): Promise<Map<string, MemberJobPay>> {
  if (jobIds.length === 0) return new Map();
  const rows = await db().select().from(memberJobPay).where(inArray(memberJobPay.jobId, jobIds));
  return new Map(rows.map((r) => [`${r.userId}|${r.jobId}`, r]));
}

export const payInputSchema = z
  .object({
    payMin: z.number().positive().max(10_000_000),
    payMax: z.number().positive().max(10_000_000),
    payPeriod: z.enum(["hour", "day", "week", "month", "year"]),
  })
  .refine((p) => p.payMax >= p.payMin, { message: "The top of the range is below the bottom." });

export type PayResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "not_found" | "no_estimate" };

async function upsert(
  userId: string,
  jobId: string,
  values: Pick<MemberJobPay, "payMin" | "payMax" | "payPeriod" | "source">,
): Promise<void> {
  await db()
    .insert(memberJobPay)
    .values({ userId, jobId, ...values })
    .onConflictDoUpdate({
      target: [memberJobPay.userId, memberJobPay.jobId],
      set: { ...values, updatedAt: new Date() },
    });
}

export async function enterPay(userId: string, jobId: string, raw: unknown): Promise<PayResult> {
  const parsed = payInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const [job] = await db().select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId));
  if (!job) return { ok: false, reason: "not_found" };
  await upsert(userId, jobId, { ...parsed.data, source: "entered" });
  return { ok: true };
}

/** Records the job's current estimate as this member's known pay. */
export async function confirmEstimate(userId: string, jobId: string): Promise<PayResult> {
  const [job] = await db().select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) return { ok: false, reason: "not_found" };
  if (!job.payEstimatePeriod || job.payEstimateMin === null || job.payEstimateMax === null) {
    return { ok: false, reason: "no_estimate" };
  }
  await upsert(userId, jobId, {
    payMin: job.payEstimateMin,
    payMax: job.payEstimateMax,
    payPeriod: job.payEstimatePeriod,
    source: "confirmed_estimate",
  });
  return { ok: true };
}

export async function clearPay(userId: string, jobId: string): Promise<void> {
  await db()
    .delete(memberJobPay)
    .where(and(eq(memberJobPay.userId, userId), eq(memberJobPay.jobId, jobId)));
}
