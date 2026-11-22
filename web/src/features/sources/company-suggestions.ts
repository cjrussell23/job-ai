import { and, count, desc, eq, gt, inArray, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  type CompanyBoardCheck,
  companyBoardChecks,
  jobMatches,
  jobs,
  watchedCompanies,
} from "@/db/schema";
import { normalizeCompany } from "@/features/jobs/identity";
import { log } from "@/lib/log";
import { type BoardSystem, boardFeedUrl, type FeedSystem } from "./company-boards";
import { type Fetcher, httpFetcher, sleep } from "./http";
import { readWorkdayBoardId, workdayCareersUrl } from "./workday";

/** Board ids worth trying for a company: "Bean Co" -> ["beanco", "bean-co"]. */
export function slugCandidates(company: string): string[] {
  const words = normalizeCompany(company)
    .split(" ")
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  if (words.length === 0) return [];
  return [...new Set([words.join(""), words.join("-")])];
}

export const boardUrl: Record<BoardSystem, (boardId: string) => string> = {
  greenhouse: (id) => `https://boards.greenhouse.io/${id}`,
  lever: (id) => `https://jobs.lever.co/${id}`,
  ashby: (id) => `https://jobs.ashbyhq.com/${id}`,
  workday: (id) => {
    const board = readWorkdayBoardId(id);
    return board ? workdayCareersUrl(board) : "";
  },
};

// Workday site names can't be guessed from a company name, so it isn't probed.
const systems: FeedSystem[] = ["greenhouse", "lever", "ashby"];

/** How many jobs a board feed lists, and the company name Greenhouse gives, if any. */
function readFeed(system: FeedSystem, data: unknown): { jobs: number; name: string | null } {
  if (system === "lever") return { jobs: Array.isArray(data) ? data.length : 0, name: null };
  const list = (data as { jobs?: { company_name?: string }[] } | null)?.jobs ?? [];
  return { jobs: list.length, name: list[0]?.company_name ?? null };
}

/**
 * Tries the company's name as a board id on each system. A board counts only if it
 * lists at least one job and, where the board names its company, the name agrees.
 */
export async function probeCompany(
  company: string,
  fetcher: Fetcher = httpFetcher,
  pause: (ms: number) => Promise<void> = sleep,
): Promise<{ system: FeedSystem; boardId: string; openJobs: number } | null> {
  const key = normalizeCompany(company);
  for (const slug of slugCandidates(company)) {
    for (const system of systems) {
      await pause(1000);
      try {
        const feed = readFeed(system, await fetcher.json(boardFeedUrl[system](slug)));
        if (feed.jobs === 0) continue;
        if (feed.name && normalizeCompany(feed.name) !== key) continue;
        return { system, boardId: slug, openJobs: feed.jobs };
      } catch {
        // No board under this id on this system.
      }
    }
  }
  return null;
}

/** Companies are checked again after this long, since boards come and go. */
const recheckAfterMs = 30 * 86_400_000;

/**
 * Checks companies from open matched jobs that aren't watched yet, most-matched
 * first. Run after the daily run and on request; a few requests per company.
 */
export async function checkCompanyBoards(
  options: { limit?: number; fetcher?: Fetcher; pause?: (ms: number) => Promise<void> } = {},
): Promise<{ checked: number; found: number }> {
  const limit = options.limit ?? 25;
  const [rows, watched, recent] = await Promise.all([
    db()
      .select({ company: jobs.company, matches: count(jobMatches.id) })
      .from(jobs)
      .innerJoin(jobMatches, eq(jobMatches.jobId, jobs.id))
      .where(eq(jobs.state, "open"))
      .groupBy(jobs.company)
      .orderBy(desc(count(jobMatches.id))),
    db()
      .select({ name: watchedCompanies.name, boardId: watchedCompanies.boardId })
      .from(watchedCompanies),
    db()
      .select({ key: companyBoardChecks.companyKey })
      .from(companyBoardChecks)
      .where(gt(companyBoardChecks.checkedAt, new Date(Date.now() - recheckAfterMs))),
  ]);
  const skip = new Set([
    ...watched.flatMap((w) => [normalizeCompany(w.name), w.boardId.toLowerCase()]),
    ...recent.map((r) => r.key),
  ]);
  const seen = new Set<string>();
  const candidates = rows
    .filter((r) => {
      const key = normalizeCompany(r.company);
      if (!key || skip.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
  let found = 0;
  for (const { company } of candidates) {
    const result = await probeCompany(company, options.fetcher, options.pause);
    if (result) found++;
    const values = {
      companyName: company,
      status: result ? ("found" as const) : ("not_found" as const),
      system: result?.system ?? null,
      boardId: result?.boardId ?? null,
      openJobs: result?.openJobs ?? null,
      checkedAt: new Date(),
    };
    await db()
      .insert(companyBoardChecks)
      .values({ companyKey: normalizeCompany(company), ...values })
      .onConflictDoUpdate({ target: companyBoardChecks.companyKey, set: values });
  }
  if (candidates.length) log.info({ checked: candidates.length, found }, "company boards checked");
  return { checked: candidates.length, found };
}

export type CompanySuggestion = CompanyBoardCheck & { yourMatches: number; url: string };

/** Found boards for companies in this member's open matches that nobody watches yet. */
export async function suggestedCompaniesFor(userId: string): Promise<CompanySuggestion[]> {
  const mine = await db()
    .select({ company: jobs.company, matches: count(jobMatches.id) })
    .from(jobMatches)
    .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
    .where(and(eq(jobMatches.userId, userId), eq(jobs.state, "open")))
    .groupBy(jobs.company);
  const byKey = new Map<string, number>();
  for (const row of mine) {
    const key = normalizeCompany(row.company);
    byKey.set(key, (byKey.get(key) ?? 0) + row.matches);
  }
  if (byKey.size === 0) return [];
  const watched = await db().select({ boardId: watchedCompanies.boardId }).from(watchedCompanies);
  const found = await db()
    .select()
    .from(companyBoardChecks)
    .where(
      and(
        eq(companyBoardChecks.status, "found"),
        inArray(companyBoardChecks.companyKey, [...byKey.keys()]),
        watched.length
          ? notInArray(
              companyBoardChecks.boardId,
              watched.map((w) => w.boardId),
            )
          : undefined,
      ),
    );
  return found
    .filter(
      (c): c is CompanyBoardCheck & { system: BoardSystem; boardId: string } =>
        c.system !== null && c.boardId !== null,
    )
    .map((c) => ({
      ...c,
      yourMatches: byKey.get(c.companyKey) ?? 0,
      url: boardUrl[c.system](c.boardId),
    }))
    .sort((a, b) => b.yourMatches - a.yourMatches);
}
