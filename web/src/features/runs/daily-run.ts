import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyRuns, scrapeRuns } from "@/db/schema";
import { closeOutRun, ingestPostings } from "@/features/jobs/ingest";
import type { AvailableSourceId } from "@/features/sources/catalogue";
import { titleMatches } from "@/features/sources/match";
import { enabledSources } from "@/features/sources/registry";
import { parsePostings, type SourceImplementation } from "@/features/sources/source";
import { addDiscoveredCompanies, listWatchedCompanies } from "@/features/sources/watched-companies";
import { activeTargetSearches } from "@/features/targets/targets";
import { runLogger } from "@/lib/log";
import { allTitles, buildQueries } from "./queries";
import { localDate, scheduledRunDue } from "./time";

export type SourceSummary = {
  searches: number;
  found: number;
  newPostings: number;
  rejected: number;
  errors: number;
  missing: number;
  closedJobs: number;
};

export type RunSummary = {
  scoring?: unknown;
  queries: number;
  sources: Partial<Record<AvailableSourceId, SourceSummary>>;
  newJobs: number;
  discoveredCompanies: number;
};

type Deps = {
  sources?: [AvailableSourceId, SourceImplementation][];
  now?: () => Date;
};

const emptySummary = (): SourceSummary => ({
  searches: 0,
  found: 0,
  newPostings: 0,
  rejected: 0,
  errors: 0,
  missing: 0,
  closedJobs: 0,
});

/**
 * One daily search: every enabled source is asked for every active target's titles
 * and places (each search once), results are saved, and each source's postings that
 * did not come back are marked missing. A source that fails is logged and skipped,
 * and is not closed out, so a broken source never makes its jobs look gone.
 */
export async function runDaily(runId: string, deps: Deps = {}): Promise<RunSummary> {
  const log = runLogger(runId);
  const now = deps.now ?? (() => new Date());
  const runAt = now();
  const targets = await activeTargetSearches();
  const queries = buildQueries(targets);
  const titles = allTitles(targets);
  const sources = deps.sources ?? (await enabledSources());
  const summary: RunSummary = {
    queries: queries.length,
    sources: {},
    newJobs: 0,
    discoveredCompanies: 0,
  };
  const boardLinks: string[] = [];

  for (const [id, source] of sources) {
    const totals = emptySummary();
    summary.sources[id] = totals;
    const seen: string[] = [];
    let failed = false;

    const record = async (
      query: string,
      location: string,
      startedAt: Date,
      work: () => Promise<unknown[]>,
      foundBy: string | null,
    ) => {
      totals.searches++;
      try {
        const { postings, rejected } = parsePostings(await work());
        const result = await ingestPostings(id, postings, runAt, foundBy);
        seen.push(...result.seenPostingIds);
        boardLinks.push(...result.boardLinks);
        totals.found += postings.length;
        totals.newPostings += result.newPostings;
        totals.rejected += rejected;
        summary.newJobs += result.newJobs;
        await db()
          .insert(scrapeRuns)
          .values({
            runId,
            source: id,
            query,
            location,
            startedAt,
            found: postings.length,
            newPostings: result.newPostings,
            error: rejected > 0 ? `${rejected} rows failed validation` : null,
          });
      } catch (error) {
        failed = true;
        totals.errors++;
        const message = error instanceof Error ? error.message : String(error);
        log.warn({ source: id, query, err: message }, "source search failed");
        await db()
          .insert(scrapeRuns)
          .values({ runId, source: id, query, location, startedAt, error: message.slice(0, 500) });
      }
    };

    if (source.kind === "search") {
      for (const query of queries) {
        await record(query.title, query.location, now(), () => source.search(query), query.title);
      }
    } else {
      const companies = (await listWatchedCompanies()).filter((c) => c.system === id);
      for (const company of companies) {
        await record(
          company.name,
          "",
          now(),
          async () => {
            const rows = await source.listCompany({ boardId: company.boardId, name: company.name });
            // Boards list every job; keep only those some member is looking for.
            return rows.filter((row) => {
              const title = (row as { title?: unknown }).title;
              return typeof title === "string" && titleMatches(title, titles);
            });
          },
          null,
        );
      }
    }

    if (!failed && totals.searches > 0) {
      const closed = await closeOutRun(id, seen, runAt);
      totals.missing = closed.missing;
      totals.closedJobs = closed.closedJobs;
    }
    log.info({ source: id, ...totals }, "source finished");
  }

  summary.discoveredCompanies = await addDiscoveredCompanies(boardLinks);
  log.info({ queries: summary.queries, newJobs: summary.newJobs }, "daily run finished");
  return summary;
}

// --- Starting runs -------------------------------------------------------------

export type StartResult =
  | { started: true; runId: string }
  | { started: false; reason: "not_due" | "already_running" };

/** Runs that started over two hours ago without finishing are treated as dead. */
const staleAfter = sql`now() - interval '2 hours'`;

async function anotherRunActive(): Promise<boolean> {
  const [active] = await db()
    .select({ id: dailyRuns.id })
    .from(dailyRuns)
    .where(and(eq(dailyRuns.status, "running"), sql`${dailyRuns.startedAt} > ${staleAfter}`));
  return active !== undefined;
}

/** Creates today's scheduled run if it is due. The unique date index stops doubles. */
export async function startScheduledRunIfDue(
  runTime: string,
  now: Date = new Date(),
): Promise<StartResult> {
  const [last] = await db()
    .select({ runDate: dailyRuns.runDate })
    .from(dailyRuns)
    .where(eq(dailyRuns.trigger, "schedule"))
    .orderBy(desc(dailyRuns.runDate))
    .limit(1);
  if (!scheduledRunDue(now, runTime, last?.runDate ?? null))
    return { started: false, reason: "not_due" };
  if (await anotherRunActive()) return { started: false, reason: "already_running" };
  const [run] = await db()
    .insert(dailyRuns)
    .values({ runDate: localDate(now), trigger: "schedule" })
    .onConflictDoNothing()
    .returning({ id: dailyRuns.id });
  return run ? { started: true, runId: run.id } : { started: false, reason: "not_due" };
}

export async function startManualRun(now: Date = new Date()): Promise<StartResult> {
  if (await anotherRunActive()) return { started: false, reason: "already_running" };
  const [run] = await db()
    .insert(dailyRuns)
    .values({ runDate: localDate(now), trigger: "manual" })
    .returning({ id: dailyRuns.id });
  if (!run) throw new Error("daily run insert returned no row");
  return { started: true, runId: run.id };
}

/** Runs a started run to completion and records the outcome. */
export async function executeRun(
  runId: string,
  deps: Deps & { afterRun?: () => Promise<unknown> } = {},
): Promise<void> {
  try {
    const found = await runDaily(runId, deps);
    // Scoring belongs to the run's outcome: a run is done once its jobs are scored.
    const summary = deps.afterRun ? { ...found, scoring: await deps.afterRun() } : found;
    await db()
      .update(dailyRuns)
      .set({ status: "done", finishedAt: sql`now()`, summary })
      .where(eq(dailyRuns.id, runId));
  } catch (error) {
    await db()
      .update(dailyRuns)
      .set({
        status: "failed",
        finishedAt: sql`now()`,
        summary: { error: error instanceof Error ? error.message : String(error) },
      })
      .where(eq(dailyRuns.id, runId));
    throw error;
  }
}

export async function recentRuns(limit = 7) {
  return db().select().from(dailyRuns).orderBy(desc(dailyRuns.startedAt)).limit(limit);
}

/** The searches of one run, failures first, for the admin dashboard. */
export async function runSearches(runId: string) {
  return db()
    .select()
    .from(scrapeRuns)
    .where(eq(scrapeRuns.runId, runId))
    .orderBy(sql`${scrapeRuns.error} is null`, scrapeRuns.source, scrapeRuns.query);
}
