import { count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobSplits, jobs, postings } from "@/db/schema";

export type SplitResult =
  | { ok: true; newJobId: string }
  | { ok: false; reason: "not_found" | "only_posting" };

/**
 * A member says a posting is not the same job as the others: it moves to a job of
 * its own, for every member, and the change is logged with who made it.
 */
export async function splitPosting(userId: string, postingId: string): Promise<SplitResult> {
  return db().transaction(async (tx) => {
    const [posting] = await tx.select().from(postings).where(eq(postings.id, postingId));
    if (!posting) return { ok: false, reason: "not_found" };
    const [siblings] = await tx
      .select({ n: count() })
      .from(postings)
      .where(eq(postings.jobId, posting.jobId));
    if ((siblings?.n ?? 0) < 2) return { ok: false, reason: "only_posting" };
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, posting.jobId));
    if (!job) return { ok: false, reason: "not_found" };

    const { id: _id, identityKey, ...fields } = job;
    const [created] = await tx
      .insert(jobs)
      // The identity key must stay unique; new postings with this identity keep
      // joining the original job, since the split cannot tell them apart.
      .values({
        ...fields,
        identityKey: `${identityKey}#split-${posting.id}`,
        title: posting.title,
        company: posting.company,
        location: posting.location,
      })
      .returning({ id: jobs.id });
    if (!created) throw new Error("split job insert returned no row");
    await tx.update(postings).set({ jobId: created.id }).where(eq(postings.id, postingId));
    await tx
      .insert(jobSplits)
      .values({ postingId, fromJobId: job.id, toJobId: created.id, userId });
    return { ok: true, newJobId: created.id };
  });
}
