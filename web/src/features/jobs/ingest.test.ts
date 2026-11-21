import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { jobSplits, jobs, postings } from "@/db/schema";
import { parsePostings, type ScrapedPosting } from "@/features/sources/source";
import { resetDb } from "@/test/db";
import { createMember } from "@/test/fixtures";
import { closeOutRun, ingestPostings } from "./ingest";
import { splitPosting } from "./splits";

beforeEach(resetDb);
afterAll(closeDb);

function posting(overrides: Partial<ScrapedPosting> = {}): ScrapedPosting {
  const [parsed] = parsePostings([
    {
      url: "https://ca.indeed.com/viewjob?jk=1",
      title: "Backend Developer",
      company: "Acme Software Inc.",
      location: "Calgary, AB",
      description: "Build APIs.",
      ...overrides,
    },
  ]).postings;
  if (!parsed) throw new Error("bad test posting");
  return parsed;
}

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12));

describe("ingest", () => {
  test("the same role from two sources is one job with two postings", async () => {
    await ingestPostings("indeed", [posting()]);
    const result = await ingestPostings("greenhouse", [
      posting({
        url: "https://boards.greenhouse.io/acme/jobs/9",
        company: "Acme Software",
        location: "Calgary, Alberta",
        description: "Build APIs in TypeScript for our billing platform.",
        pay: { min: 95000, max: 115000, period: "year" },
      }),
    ]);
    expect(result).toMatchObject({ newPostings: 1, newJobs: 0 });

    const allJobs = await db().select().from(jobs);
    expect(allJobs).toHaveLength(1);
    expect(await db().select().from(postings)).toHaveLength(2);
    // The richer posting fills in the job, and the employer's system wins over the board.
    expect(allJobs[0]).toMatchObject({
      description: "Build APIs in TypeScript for our billing platform.",
      payMin: 95000,
      payPeriod: "year",
      applicationSystem: "greenhouse",
    });
  });

  test("seeing a known link again only updates when it was last seen", async () => {
    await ingestPostings("indeed", [posting()], day(1));
    const again = await ingestPostings("indeed", [posting()], day(2));
    expect(again).toMatchObject({ newPostings: 0, newJobs: 0 });
    const [row] = await db().select().from(postings);
    expect(row?.lastSeenAt.toISOString()).toBe(day(2).toISOString());
  });

  test("invalid source rows are rejected, not saved", () => {
    const { postings: valid, rejected } = parsePostings([{ url: "not a url", title: "" }, {}]);
    expect(valid).toHaveLength(0);
    expect(rejected).toBe(2);
  });

  test("links to company boards are collected for watched companies", async () => {
    const result = await ingestPostings("jobbank", [
      posting({
        url: "https://www.jobbank.gc.ca/jobsearch/jobposting/1",
        description: "Apply at https://jobs.lever.co/acme/abc-123 today.",
      }),
    ]);
    expect(result.boardLinks).toEqual(["https://jobs.lever.co/acme/abc-123"]);
  });
});

describe("lifecycle", () => {
  test("a posting not seen is missing, and its job closes after three missed runs", async () => {
    const first = await ingestPostings("indeed", [posting()], day(1));
    await closeOutRun("indeed", first.seenPostingIds, day(1));

    for (const n of [2, 3]) {
      await closeOutRun("indeed", [], day(n));
      expect((await db().select().from(jobs))[0]?.state).toBe("open");
    }
    await closeOutRun("indeed", [], day(4));
    const [job] = await db().select().from(jobs);
    expect(job?.state).toBe("closed");
    expect((await db().select().from(postings))[0]?.missingRuns).toBe(3);
  });

  test("a job stays open while any of its postings is still listed", async () => {
    await ingestPostings("indeed", [posting()], day(1));
    const career = posting({ url: "https://boards.greenhouse.io/acme/jobs/9" });
    for (const n of [2, 3, 4, 5]) {
      const seen = await ingestPostings("greenhouse", [career], day(n));
      await closeOutRun("greenhouse", seen.seenPostingIds, day(n));
      await closeOutRun("indeed", [], day(n));
    }
    expect((await db().select().from(jobs))[0]?.state).toBe("open");
  });

  test("a closed job reopens when it is listed again", async () => {
    await ingestPostings("indeed", [posting()], day(1));
    for (const n of [2, 3, 4]) await closeOutRun("indeed", [], day(n));
    expect((await db().select().from(jobs))[0]?.state).toBe("closed");
    await ingestPostings("indeed", [posting()], day(5));
    const [job] = await db().select().from(jobs);
    expect(job?.state).toBe("open");
    expect((await db().select().from(postings))[0]?.missingRuns).toBe(0);
  });

  test("closing out one source never touches another source's postings", async () => {
    await ingestPostings(
      "greenhouse",
      [posting({ url: "https://boards.greenhouse.io/acme/jobs/9" })],
      day(1),
    );
    await closeOutRun("indeed", [], day(2));
    expect((await db().select().from(postings))[0]?.missingRuns).toBe(0);
  });
});

describe("not duplicates", () => {
  test("splitting moves the posting to its own job for everyone and logs who did it", async () => {
    const userId = await createMember("a@example.com");
    await ingestPostings("indeed", [posting()]);
    await ingestPostings("greenhouse", [
      posting({ url: "https://boards.greenhouse.io/acme/jobs/9" }),
    ]);
    const [career] = await db()
      .select()
      .from(postings)
      .where(eq(postings.url, "https://boards.greenhouse.io/acme/jobs/9"));
    if (!career) throw new Error("missing posting");

    const result = await splitPosting(userId, career.id);
    expect(result.ok).toBe(true);
    expect(await db().select().from(jobs)).toHaveLength(2);
    const [log] = await db().select().from(jobSplits);
    expect(log).toMatchObject({ postingId: career.id, userId });

    // A job's only posting cannot be split off.
    expect(await splitPosting(userId, career.id)).toEqual({ ok: false, reason: "only_posting" });
  });
});
