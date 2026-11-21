import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, postings } from "@/db/schema";
import type { ScrapedPosting } from "@/features/sources/source";
import { aggregatorSystems, applicationSystem } from "./application-system";
import { identityKey } from "./identity";

export type IngestResult = {
  found: number;
  newPostings: number;
  newJobs: number;
  /** Ids of every posting seen, for closing out the run. */
  seenPostingIds: string[];
  /** Links found in descriptions or posting urls to company boards, for watched companies. */
  boardLinks: string[];
};

const boardLink =
  /https?:\/\/(?:boards|job-boards)\.greenhouse\.io\/[^\s"'<>)]+|https?:\/\/jobs\.(?:lever\.co|ashbyhq\.com)\/[^\s"'<>)]+/g;

/**
 * Saves a source's postings. A posting already known by its link is marked seen; a new
 * one joins the open or closed job with the same identity, or starts a new job.
 */
export async function ingestPostings(
  source: string,
  scraped: ScrapedPosting[],
  seenAt: Date = new Date(),
): Promise<IngestResult> {
  const result: IngestResult = {
    found: scraped.length,
    newPostings: 0,
    newJobs: 0,
    seenPostingIds: [],
    boardLinks: [],
  };

  for (const posting of scraped) {
    result.boardLinks.push(...(posting.description.match(boardLink) ?? []));
    if (boardLink.test(posting.url)) result.boardLinks.push(posting.url);
    boardLink.lastIndex = 0;

    await db().transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: postings.id, jobId: postings.jobId })
        .from(postings)
        .where(eq(postings.url, posting.url));

      let jobId: string;
      let postingId: string;
      if (existing) {
        await tx
          .update(postings)
          .set({ lastSeenAt: seenAt, missingRuns: 0 })
          .where(eq(postings.id, existing.id));
        jobId = existing.jobId;
        postingId = existing.id;
      } else {
        const key = identityKey(posting);
        const [job] = await tx.select().from(jobs).where(eq(jobs.identityKey, key));
        if (job) {
          jobId = job.id;
        } else {
          const [created] = await tx
            .insert(jobs)
            .values({
              identityKey: key,
              company: posting.company,
              title: posting.title,
              location: posting.location,
              firstSeenAt: seenAt,
            })
            .returning({ id: jobs.id });
          if (!created) throw new Error("job insert returned no row");
          jobId = created.id;
          result.newJobs++;
        }
        const [inserted] = await tx
          .insert(postings)
          .values({
            jobId,
            source,
            url: posting.url,
            title: posting.title,
            company: posting.company,
            location: posting.location,
            postedAt: posting.postedAt,
            firstSeenAt: seenAt,
            lastSeenAt: seenAt,
          })
          .returning({ id: postings.id });
        if (!inserted) throw new Error("posting insert returned no row");
        postingId = inserted.id;
        result.newPostings++;
      }
      result.seenPostingIds.push(postingId);
      await enrichJob(tx, jobId, posting);
    });
  }
  return result;
}

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

/** Fills gaps on the job from a posting, and reopens a closed job that is listed again. */
async function enrichJob(tx: Tx, jobId: string, posting: ScrapedPosting) {
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) return;
  const system = applicationSystem(posting.url);
  const update: Partial<typeof jobs.$inferInsert> = {};
  if (posting.description.length > job.description.length) update.description = posting.description;
  if (job.payPeriod === null && posting.pay) {
    update.payMin = posting.pay.min;
    update.payMax = posting.pay.max;
    update.payPeriod = posting.pay.period;
  }
  if (job.hoursPerWeek === null && posting.hoursPerWeek) update.hoursPerWeek = posting.hoursPerWeek;
  if (job.remote === "unknown" && posting.remote !== "unknown") update.remote = posting.remote;
  // The employer's own system wins over a job board.
  if (
    system &&
    (job.applicationSystem === null ||
      (aggregatorSystems.has(job.applicationSystem) && !aggregatorSystems.has(system)))
  ) {
    update.applicationSystem = system;
  }
  if (job.state === "closed") {
    update.state = "open";
    update.closedAt = null;
  }
  if (Object.keys(update).length > 0) await tx.update(jobs).set(update).where(eq(jobs.id, jobId));
}

export const closeAfterMissingRuns = 3;

/**
 * Ends a daily run for one source: every posting from that source not seen in the run
 * is missing for one more run, and jobs whose postings have all been missing for three
 * consecutive runs are closed.
 */
export async function closeOutRun(
  source: string,
  seenPostingIds: string[],
  runAt: Date = new Date(),
): Promise<{ missing: number; closedJobs: number }> {
  return db().transaction(async (tx) => {
    const unseen = await tx
      .update(postings)
      .set({ missingRuns: sql`${postings.missingRuns} + 1` })
      .where(
        and(
          eq(postings.source, source),
          lt(postings.lastSeenAt, runAt),
          seenPostingIds.length > 0 ? sql`${postings.id} not in ${seenPostingIds}` : sql`true`,
        ),
      )
      .returning({ jobId: postings.jobId });
    const touchedJobs = [...new Set(unseen.map((p) => p.jobId))];
    if (touchedJobs.length === 0) return { missing: 0, closedJobs: 0 };
    const closed = await tx
      .update(jobs)
      .set({ state: "closed", closedAt: runAt })
      .where(
        and(
          inArray(jobs.id, touchedJobs),
          eq(jobs.state, "open"),
          sql`not exists (select 1 from ${postings} p where p.job_id = ${jobs.id} and p.missing_runs < ${closeAfterMissingRuns})`,
        ),
      )
      .returning({ id: jobs.id });
    return { missing: unseen.length, closedJobs: closed.length };
  });
}
