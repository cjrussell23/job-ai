import { z } from "zod";
import { scraperEnv } from "@/lib/env";
import type { SearchQuery, SearchSource } from "./source";

/**
 * Indeed Canada and LinkedIn, through the Python scraper service that wraps JobSpy.
 * The service only fetches; mapping and everything after happen here.
 */

const row = z.object({
  job_url: z.string(),
  job_url_direct: z.string().nullish(),
  title: z.string().nullish(),
  company: z.string().nullish(),
  location: z.string().nullish(),
  date_posted: z.string().nullish(),
  description: z.string().nullish(),
  is_remote: z.boolean().nullish(),
  work_from_home_type: z.string().nullish(),
  interval: z.string().nullish(),
  min_amount: z.number().nullish(),
  max_amount: z.number().nullish(),
});

const response = z.object({ jobs: z.array(z.unknown()), error: z.string().nullish() });

const intervals: Record<string, "hour" | "day" | "week" | "month" | "year"> = {
  hourly: "hour",
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

export function mapJobSpyRows(rows: unknown[]): unknown[] {
  return rows.flatMap((raw) => {
    const parsed = row.safeParse(raw);
    if (!parsed.success) return [raw]; // let the common schema count it as rejected
    const job = parsed.data;
    const period = job.interval ? intervals[job.interval] : undefined;
    const homeType = (job.work_from_home_type ?? "").toLowerCase();
    return [
      {
        url: job.job_url,
        applyUrl: job.job_url_direct ?? null,
        title: job.title ?? "",
        company: job.company ?? "",
        location: (job.location ?? "").replace(/,\s*Canada$/i, ""),
        description: job.description ?? "",
        postedAt: job.date_posted ?? null,
        remote: job.is_remote ? "remote" : homeType.includes("hybrid") ? "hybrid" : "unknown",
        pay:
          period && (job.min_amount || job.max_amount)
            ? { min: job.min_amount ?? null, max: job.max_amount ?? null, period }
            : null,
      },
    ];
  });
}

export type ScraperCall = (body: Record<string, unknown>) => Promise<unknown>;

const callScraper: ScraperCall = async (body) => {
  const result = await fetch(`${scraperEnv().SCRAPER_URL}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // LinkedIn descriptions add a request per job; give a search a few minutes.
    signal: AbortSignal.timeout(300_000),
  });
  if (!result.ok) throw new Error(`scraper service answered ${result.status}`);
  return result.json();
};

export function createJobSpySource(
  site: "indeed" | "linkedin",
  call: ScraperCall = callScraper,
): SearchSource {
  return {
    kind: "search",
    async search(query: SearchQuery) {
      const body = response.parse(
        await call({
          site,
          search_term: query.title,
          location: query.location,
          // LinkedIn rate-limits bursts, so it is asked for fewer results.
          results_wanted: site === "linkedin" ? 15 : 30,
          hours_old: 72,
        }),
      );
      if (body.error) throw new Error(body.error);
      return mapJobSpyRows(body.jobs);
    },
  };
}
