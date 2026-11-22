import { HTMLElement, parse } from "node-html-parser";
import { parsePlace } from "@/lib/places";
import { type Fetcher, httpFetcher, sleep } from "./http";
import { locationMatches, titleMatchesLoosely } from "./match";
import type { ScrapedPosting, SearchQuery, SearchSource } from "./source";

/**
 * Alberta Health Services and Recovery Alberta, two career sites on the same Taleo
 * front end. Their search pages refuse automated readers, so each run reads every
 * listing page named in the site's /sitemap (job categories and landing pages) plus
 * /latest-jobs, and filters the rows locally. A listing page shows only its newest
 * rows (the "load more" call is refused too), so a daily run sees each category's
 * newest postings, not its whole backlog.
 */

export const ahsSites = [
  { origin: "https://careers.albertahealthservices.ca", company: "Alberta Health Services" },
  { origin: "https://careers.recoveryalberta.ca", company: "Recovery Alberta" },
] as const;
type Site = (typeof ahsSites)[number];

export type AhsListEntry = {
  url: string;
  title: string;
  location: string;
  requisition: string;
  company: string;
};

/** The listing pages a site map links to: categories, landing pages and locations. */
export function parseAhsSitemap(html: string, origin: string): string[] {
  const urls = parse(html)
    .querySelectorAll("a")
    .map((a) => a.getAttribute("href")?.trim() ?? "")
    .filter((href) => href.startsWith(`${origin}/`))
    .filter((href) => /\/(page|landingpages|location)\/[^/]+$/.test(href))
    // "X - DNU" pages are retired ("do not use") but still linked.
    .filter((href) => !/\/x-dnu-/.test(href));
  return [...new Set(urls)];
}

/** Text of an element without its icon glyphs. */
function plainText(el: HTMLElement | null): string {
  if (!el) return "";
  return el.childNodes
    .filter((n) => !(n instanceof HTMLElement && n.classList.contains("entypo")))
    .map((n) => n.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** "North Zone, Grande Prairie, Grande Prairie Virene Building" -> "Grande Prairie, AB". */
export function ahsLocation(text: string): string {
  const city = text.split(",")[1]?.trim();
  // Rows without a city (multi-site postings) are still somewhere in Alberta.
  return city ? `${city}, AB` : "Alberta";
}

export function parseAhsListing(html: string, company: string): AhsListEntry[] {
  return parse(html)
    .querySelectorAll("div.job_list_row")
    .flatMap((row) => {
      const link = row.querySelector("a.job_link");
      const url = link?.getAttribute("href")?.trim();
      const title = link?.text.trim();
      if (!url || !title) return [];
      return [
        {
          url,
          title,
          location: ahsLocation(plainText(row.querySelector("p.jlr_location a.location"))),
          requisition: row.querySelector(".job_external_id .field_value")?.text.trim() ?? "",
          company,
        },
      ];
    });
}

type Pay = NonNullable<ScrapedPosting["pay"]>;

/** Reads "Minimum Salary: $68.56 Maximum Salary: $80.20", which states no period. */
export function parseAhsPay(text: string): Pay | null {
  const figure = (label: string) => {
    const raw = text.match(
      new RegExp(`${label} Salary:\\s*\\$?\\s*([\\d,]+(?:\\.\\d+)?)`, "i"),
    )?.[1];
    const value = raw ? Number.parseFloat(raw.replace(/,/g, "")) : Number.NaN;
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const min = figure("Minimum");
  const max = figure("Maximum") ?? min;
  const top = max ?? min;
  if (top === null) return null;
  // Union scales are hourly; out-of-scope roles give a yearly figure. Anything in
  // between can't be read either way, so it is left out rather than guessed.
  const period = top < 1000 ? "hour" : top >= 10_000 ? "year" : null;
  return period ? { min: min ?? max, max, period } : null;
}

/** "19 hours ago", "2 days ago" -> a date; the site shows nothing more exact. */
export function relativeDate(text: string, now = Date.now()): string | null {
  const match = text.match(/(\d+)\s*(minute|hour|day|week|month)s?\s+ago/i);
  if (!match?.[1] || !match[2]) return /today/i.test(text) ? new Date(now).toISOString() : null;
  const unit: Record<string, number> = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 7 * 86_400_000,
    month: 30 * 86_400_000,
  };
  const ms = unit[match[2].toLowerCase()];
  return ms ? new Date(now - Number(match[1]) * ms).toISOString() : null;
}

export function parseAhsPosting(html: string) {
  // The pay and hours list is written as <b><li>Label: </b>value</li>, which the parser
  // can't nest; without this fix it drops the whole list.
  const root = parse(html.replace(/<b>\s*<li>/gi, "<li><b>"));
  const descriptionEl = root.querySelector("div.job_description");
  const qualificationsEl = root.querySelector(".job_qualifications");
  const parts = [descriptionEl?.structuredText.trim() ?? ""];
  if (qualificationsEl && !qualificationsEl.closest("div.job_description")) {
    parts.push(qualificationsEl.structuredText.trim());
  }
  const description = parts.filter(Boolean).join("\n\n");
  const field = (label: string) =>
    Number.parseFloat(description.match(new RegExp(`${label}:\\s*([\\d.]+)`, "i"))?.[1] ?? "");
  const weekly =
    (field("Hours per Shift") * field("Shifts per cycle")) / field("Length of Shift in weeks");
  const located = plainText(root.querySelector("h4.primary_location a"));
  return {
    title: root.querySelector("h1.title")?.text.trim() ?? "",
    location: located ? ahsLocation(located) : "",
    description,
    postedAt: relativeDate(root.querySelector(".job_post_date .field_value")?.text ?? ""),
    pay: parseAhsPay(description),
    hoursPerWeek: Number.isFinite(weekly) && weekly > 0 && weekly <= 80 ? Math.round(weekly) : null,
  };
}

/** Whether a searched place could hold any Alberta job at all. */
function mayBeInAlberta(location: string): boolean {
  const place = parsePlace(location);
  if (!place) return false;
  if (place.kind === "country") return place.country === "Canada";
  return place.province === "AB" || place.province === null;
}

export function createAhsSource(fetcher: Fetcher = httpFetcher, pause = sleep): SearchSource {
  async function readSite(site: Site): Promise<AhsListEntry[]> {
    const pages = [
      `${site.origin}/latest-jobs`,
      ...parseAhsSitemap(await fetcher.text(`${site.origin}/sitemap`), site.origin),
    ];
    const entries: AhsListEntry[] = [];
    let failures = 0;
    let lastError: unknown;
    for (const page of pages) {
      await pause(1500);
      try {
        entries.push(...parseAhsListing(await fetcher.text(page), site.company));
      } catch (error) {
        // One retired or broken category page shouldn't lose the rest of the site.
        failures++;
        lastError = error;
      }
    }
    if (failures === pages.length) throw lastError;
    return entries;
  }

  async function readAll(): Promise<AhsListEntry[]> {
    const byUrl = new Map<string, AhsListEntry>();
    let lastError: unknown;
    let failedSites = 0;
    for (const site of ahsSites) {
      try {
        for (const entry of await readSite(site)) {
          if (!byUrl.has(entry.url)) byUrl.set(entry.url, entry);
        }
      } catch (error) {
        // One site being down shouldn't hide the other's postings.
        failedSites++;
        lastError = error;
      }
    }
    if (failedSites === ahsSites.length) throw lastError;
    return [...byUrl.values()];
  }

  // The listings are the same for every query in a run; read them once per hour at
  // most, and share one read between queries that arrive while it is under way.
  let cached: { entries: Promise<AhsListEntry[]>; at: number } | undefined;
  return {
    kind: "search",
    async search(query: SearchQuery) {
      if (!mayBeInAlberta(query.location)) return [];
      if (!cached || Date.now() - cached.at > 3_600_000) {
        const entries = readAll();
        cached = { entries, at: Date.now() };
        entries.catch(() => {
          cached = undefined;
        });
      }
      const matches = (await cached.entries).filter(
        (e) =>
          locationMatches(e.location, query.location) &&
          titleMatchesLoosely(e.title, [query.title]),
      );
      const postings: unknown[] = [];
      for (const entry of matches) {
        await pause(1500);
        const page = parseAhsPosting(await fetcher.text(entry.url));
        postings.push({
          url: entry.url,
          company: entry.company,
          ...page,
          title: page.title || entry.title,
          location: page.location || entry.location,
        });
      }
      return postings;
    },
  };
}
