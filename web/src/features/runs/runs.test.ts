import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { dailyRuns, jobs, postings, scrapeRuns, watchedCompanies } from "@/db/schema";
import type { SearchQuery, SourceImplementation } from "@/features/sources/source";
import { approveSearchTitles, createTarget } from "@/features/targets/targets";
import { resetDb } from "@/test/db";
import { createMember } from "@/test/fixtures";
import { executeRun, runDaily, startManualRun, startScheduledRunIfDue } from "./daily-run";
import { buildQueries } from "./queries";
import { localDate, scheduledRunDue } from "./time";

describe("scheduling", () => {
  // 13:00 UTC is 07:00 in Calgary (UTC-6).
  const morning = new Date("2026-11-21T13:00:00Z");

  test("dates and times are in Calgary", () => {
    expect(localDate(new Date("2026-11-21T03:00:00Z"))).toBe("2026-11-20");
  });

  test("a run is due after the run time, once per day", () => {
    expect(scheduledRunDue(morning, "05:00", "2026-11-20")).toBe(true);
    expect(scheduledRunDue(morning, "05:00", "2026-11-21")).toBe(false);
    expect(scheduledRunDue(morning, "08:00", "2026-11-20")).toBe(false);
    // A missed day is caught up.
    expect(scheduledRunDue(morning, "05:00", "2026-11-15")).toBe(true);
    expect(scheduledRunDue(morning, "05:00", null)).toBe(true);
  });
});

test("identical searches from different members are run once", () => {
  const queries = buildQueries([
    {
      searchTitles: ["Barista", "Cafe Attendant"],
      locations: ["Calgary, AB"],
      workplace: "local_or_remote",
    },
    { searchTitles: ["barista "], locations: ["calgary, ab"], workplace: "local_only" },
    { searchTitles: ["Data Analyst"], locations: ["Calgary, AB"], workplace: "remote_only" },
  ]);
  expect(queries).toEqual([
    { title: "Barista", location: "Calgary, AB" },
    { title: "Cafe Attendant", location: "Calgary, AB" },
    { title: "Data Analyst", location: "Canada" },
  ]);
});

describe("the daily run", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  async function memberWantingBaristaJobs() {
    const userId = await createMember("a@example.com");
    const target = await createTarget(userId, { roleType: "Barista", locations: ["Calgary, AB"] });
    if (!target.ok) throw new Error("target not created");
    await approveSearchTitles(userId, target.id, ["Barista"]);
  }

  const posting = (url: string, title = "Barista") => ({
    url,
    title,
    company: "Bean Co",
    location: "Calgary, AB",
    description: "Make coffee.",
  });

  test("searches every source, saves postings and logs each search", async () => {
    await memberWantingBaristaJobs();
    const asked: SearchQuery[] = [];
    const board: SourceImplementation = {
      kind: "search",
      search: async (query) => {
        asked.push(query);
        return [posting("https://ca.indeed.com/viewjob?jk=1")];
      },
    };
    const summary = await runDaily("run-1", { sources: [["indeed", board]] });

    expect(asked).toEqual([{ title: "Barista", location: "Calgary, AB" }]);
    expect(summary).toMatchObject({
      queries: 1,
      newJobs: 1,
      sources: { indeed: { found: 1, newPostings: 1, errors: 0 } },
    });
    expect(await db().select().from(postings)).toHaveLength(1);
    const [log] = await db().select().from(scrapeRuns);
    expect(log).toMatchObject({
      runId: "run-1",
      source: "indeed",
      query: "Barista",
      found: 1,
      error: null,
    });
  });

  test("a failing source is logged and skipped, and its jobs are not marked missing", async () => {
    await memberWantingBaristaJobs();
    const working: SourceImplementation = {
      kind: "search",
      search: async () => [posting("https://ca.indeed.com/viewjob?jk=1")],
    };
    await runDaily("run-1", { sources: [["indeed", working]] });

    const broken: SourceImplementation = {
      kind: "search",
      search: async () => {
        throw new Error("429 Too Many Requests");
      },
    };
    const summary = await runDaily("run-2", {
      sources: [
        ["indeed", broken],
        ["linkedin", working],
      ],
    });

    expect(summary.sources.indeed).toMatchObject({ errors: 1, missing: 0 });
    const failed = (await db().select().from(scrapeRuns)).find(
      (r) => r.runId === "run-2" && r.source === "indeed",
    );
    expect(failed?.error).toContain("429");
    // The Indeed posting was not seen, but Indeed failed, so it is not counted missing.
    const indeedPosting = (await db().select().from(postings)).find((p) => p.source === "indeed");
    expect(indeedPosting?.missingRuns).toBe(0);
  });

  test("company boards are filtered to titles someone is looking for", async () => {
    await memberWantingBaristaJobs();
    await db()
      .insert(watchedCompanies)
      .values({ name: "Bean Co", system: "lever", boardId: "bean", origin: "member" });
    const lever: SourceImplementation = {
      kind: "company-feed",
      listCompany: async () => [
        posting("https://jobs.lever.co/bean/1", "Senior Barista"),
        posting("https://jobs.lever.co/bean/2", "Chief Financial Officer"),
      ],
    };
    const summary = await runDaily("run-1", { sources: [["lever", lever]] });
    expect(summary.sources.lever).toMatchObject({ found: 1 });
    expect((await db().select().from(jobs)).map((j) => j.title)).toEqual(["Senior Barista"]);
  });

  test("no active targets with approved titles means no searches", async () => {
    const userId = await createMember("a@example.com");
    await createTarget(userId, { roleType: "Barista" });
    const board: SourceImplementation = {
      kind: "search",
      search: async () => {
        throw new Error("should not be called");
      },
    };
    expect(await runDaily("run-1", { sources: [["indeed", board]] })).toMatchObject({ queries: 0 });
  });
});

describe("starting runs", () => {
  beforeEach(resetDb);

  const morning = new Date("2026-11-21T13:00:00Z");

  test("the scheduled run starts once per Calgary day", async () => {
    expect((await startScheduledRunIfDue("05:00", morning)).started).toBe(true);
    await db().update(dailyRuns).set({ status: "done" });
    expect(await startScheduledRunIfDue("05:00", morning)).toEqual({
      started: false,
      reason: "not_due",
    });
  });

  test("a manual run cannot start while another is running", async () => {
    expect((await startManualRun(morning)).started).toBe(true);
    expect(await startManualRun(morning)).toEqual({ started: false, reason: "already_running" });
  });

  test("a finished run records its summary", async () => {
    const run = await startManualRun(morning);
    if (!run.started) throw new Error("run not started");
    await executeRun(run.runId, { sources: [] });
    const [row] = await db().select().from(dailyRuns);
    expect(row).toMatchObject({ status: "done", summary: { queries: 0 } });
  });
});
