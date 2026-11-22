import { and, count, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { type CompanyProfile, companyProfiles, jobMatches, jobs } from "@/db/schema";
import { runTask } from "@/features/ai/run-task";
import { describeCompany } from "@/features/ai/tasks/describe-company";
import { log } from "@/lib/log";
import { queue, queues } from "@/lib/queue";
import { normalizeCompany } from "./identity";

export type { CompanyProfile };

/** Descriptions are refreshed after this long; a failed lookup is retried sooner. */
const refreshAfterMs = 90 * 86_400_000;
const retryFailedAfterMs = 7 * 86_400_000;

export async function profilesFor(companies: string[]): Promise<Map<string, CompanyProfile>> {
  const keys = [...new Set(companies.map(normalizeCompany).filter(Boolean))];
  if (keys.length === 0) return new Map();
  const rows = await db()
    .select()
    .from(companyProfiles)
    .where(inArray(companyProfiles.companyKey, keys));
  return new Map(rows.map((r) => [r.companyKey, r]));
}

export function profileOf(
  map: Map<string, CompanyProfile>,
  company: string,
): CompanyProfile | undefined {
  return map.get(normalizeCompany(company));
}

/**
 * Pure: keeps only source links the web search really returned, so a description never
 * cites a page that wasn't found (compared without the protocol, "www." or a trailing slash).
 */
export function realSources(
  claimed: { title: string; url: string }[],
  searched: string[],
): { title: string; url: string }[] {
  const key = (u: string) =>
    u
      .replace(/^https?:\/\/(www\.)?/i, "")
      .replace(/[/#?]+$/, "")
      .toLowerCase();
  const found = new Set(searched.map(key));
  const seen = new Set<string>();
  return claimed.filter((s) => {
    const k = key(s.url);
    if (!found.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Looks one company up on the web and saves its description. App-level work, shared by all. */
export async function describeOne(company: string): Promise<boolean> {
  const companyKey = normalizeCompany(company);
  if (!companyKey) return false;
  const postings = await db()
    .select({ title: jobs.title, location: jobs.location })
    .from(jobs)
    .where(and(eq(jobs.company, company), eq(jobs.state, "open")))
    .limit(20);
  const locations = new Map<string, number>();
  for (const p of postings)
    if (p.location) locations.set(p.location, (locations.get(p.location) ?? 0) + 1);
  const location = [...locations].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const result = await runTask(null, describeCompany, {
    company,
    location,
    jobTitles: [...new Set(postings.map((p) => p.title))].slice(0, 5),
  });
  const values = result.ok
    ? (() => {
        const { sources, ...facts } = result.output;
        return {
          companyName: company,
          facts,
          sources: realSources(sources, result.searchedUrls ?? []),
          failure: null,
          generatedAt: new Date(),
        };
      })()
    : {
        companyName: company,
        facts: null,
        sources: [],
        failure: result.reason,
        generatedAt: new Date(),
      };
  await db()
    .insert(companyProfiles)
    .values({ companyKey, ...values })
    .onConflictDoUpdate({ target: companyProfiles.companyKey, set: values });
  return result.ok;
}

/**
 * After a run: describes companies in open matched jobs that have no description yet
 * (or an old one), most-matched first. Each is one model call with web searches.
 */
export async function describeMatchedCompanies(
  limit = 15,
): Promise<{ described: number; failed: number }> {
  const [companies, existing] = await Promise.all([
    db()
      .select({ company: jobs.company, matches: count(jobMatches.id) })
      .from(jobs)
      .innerJoin(jobMatches, eq(jobMatches.jobId, jobs.id))
      .where(and(eq(jobs.state, "open"), eq(jobMatches.firmLimitResult, "pass")))
      .groupBy(jobs.company)
      .orderBy(desc(count(jobMatches.id))),
    db()
      .select()
      .from(companyProfiles)
      .where(gt(companyProfiles.generatedAt, new Date(Date.now() - refreshAfterMs))),
  ]);
  const fresh = new Set(
    existing
      .filter((p) => !p.failure || Date.now() - p.generatedAt.getTime() < retryFailedAfterMs)
      .map((p) => p.companyKey),
  );
  const seen = new Set<string>();
  const todo = companies
    .filter(({ company }) => {
      const key = normalizeCompany(company);
      if (!key || fresh.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
  let described = 0;
  let failed = 0;
  for (const { company } of todo) {
    if (await describeOne(company)) described++;
    else failed++;
  }
  if (todo.length) log.info({ described, failed }, "companies described");
  return { described, failed };
}

/** Asks the worker to look a company up now (from a job page). */
export async function requestCompanyProfile(company: string): Promise<void> {
  await (await queue()).send(
    queues.describeCompany,
    { company },
    { singletonKey: `describe:${normalizeCompany(company)}` },
  );
}
