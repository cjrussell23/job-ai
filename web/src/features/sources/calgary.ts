import { parse } from "node-html-parser";
import { type Fetcher, httpFetcher, sleep } from "./http";
import { locationMatches, titleMatchesLoosely } from "./match";
import type { ScrapedPosting, SearchQuery, SearchSource } from "./source";

/**
 * City of Calgary. The careers page lists every open external posting as static HTML
 * (title, link and closing date only), so the list is read once per run and filtered
 * locally; only matching postings' PeopleSoft pages are fetched.
 */

const listUrl = "https://www.calgary.ca/careers.html";
const company = "City of Calgary";
// Every posting on the list is a City job in Calgary; the list itself names no place.
const location = "Calgary, AB";

export type CalgaryListEntry = { url: string; title: string };

export function parseCareersList(html: string): CalgaryListEntry[] {
  return parse(html)
    .querySelectorAll("a.job-title")
    .flatMap((a) => {
      const url = a.getAttribute("href")?.trim();
      const title = a.text.trim();
      return url && title ? [{ url, title }] : [];
    });
}

type Pay = NonNullable<ScrapedPosting["pay"]>;

/**
 * Reads the "Compensation:" line, e.g. "Pay Grade 11 $46.21 - 61.78 per hour". The
 * upper figure has no dollar sign, so the general pay parser would miss it.
 */
export function parseCompensation(text: string): Pay | null {
  const line = text.match(/compensation:([^\n]*)/i)?.[1];
  if (!line) return null;
  const range = line.match(/\$\s*([\d,]+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*\$?\s*([\d,]+(?:\.\d+)?))?/i);
  if (!range?.[1]) return null;
  const toNumber = (raw: string | undefined) => {
    if (!raw) return null;
    const value = Number.parseFloat(raw.replace(/,/g, ""));
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const min = toNumber(range[1]);
  const max = toNumber(range[2]) ?? min;
  const period: Pay["period"] | null = /hour|hourly|\/hr/i.test(line)
    ? "hour"
    : /annual|year/i.test(line)
      ? "year"
      : /month/i.test(line)
        ? "month"
        : /week/i.test(line)
          ? "week"
          : null;
  return period && min ? { min, max, period } : null;
}

export function parseCalgaryPosting(html: string) {
  const root = parse(html);
  const byId = (id: string) => root.getElementById(id)?.text.trim() ?? "";
  const description = root
    .querySelectorAll('[id^="HRS_SCH_PSTDSC_DESCRLONG"]')
    .map((el) => el.structuredText.trim())
    .filter(Boolean)
    .join("\n\n");
  const hours = description.match(/(\d{1,2}(?:\.\d+)?)\s*hour work week/i)?.[1];
  return {
    title: byId("HRS_SCH_WRK2_POSTING_TITLE"),
    company,
    location,
    description,
    pay: parseCompensation(description),
    hoursPerWeek: hours ? Math.round(Number.parseFloat(hours)) : null,
  };
}

export function createCalgarySource(fetcher: Fetcher = httpFetcher, pause = sleep): SearchSource {
  // The list is the same for every query in a run; read it once per hour at most.
  let cached: { entries: CalgaryListEntry[]; at: number } | undefined;
  return {
    kind: "search",
    async search(query: SearchQuery) {
      if (!locationMatches(location, query.location)) return [];
      if (!cached || Date.now() - cached.at > 3_600_000) {
        cached = { entries: parseCareersList(await fetcher.text(listUrl)), at: Date.now() };
      }
      const matches = cached.entries.filter((e) => titleMatchesLoosely(e.title, [query.title]));
      const postings: unknown[] = [];
      for (const entry of matches) {
        await pause(2000);
        const page = parseCalgaryPosting(await fetcher.text(entry.url));
        // A posting page that failed to load as expected still has its listed title.
        postings.push({ url: entry.url, ...page, title: page.title || entry.title });
      }
      return postings;
    },
  };
}
