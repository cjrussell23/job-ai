import { parse } from "node-html-parser";
import { type Fetcher, httpFetcher, sleep } from "./http";
import { city, titleMatches } from "./match";
import { parsePayText } from "./pay-text";
import type { SearchQuery, SearchSource } from "./source";

/**
 * Government of Alberta (jobpostings.alberta.ca). Its RSS path is disallowed by
 * robots.txt, so the site map is read instead: every open posting's link carries its
 * city and title, which are matched locally before any posting page is fetched.
 */

const sitemapUrl = "https://jobpostings.alberta.ca/sitemap.xml";

export type SitemapEntry = { url: string; city: string; title: string };

export function parseSitemap(xml: string): SitemapEntry[] {
  return parse(xml)
    .querySelectorAll("loc")
    .map((loc) => loc.text.trim())
    .flatMap((url) => {
      const slug = url.match(/\/job\/([^/]+)\/\d+\/?$/)?.[1];
      if (!slug) return [];
      const [placeName, ...titleParts] = decodeURIComponent(slug).split("-");
      return [{ url, city: placeName ?? "", title: titleParts.join(" ") }];
    });
}

export function parsePostingPage(html: string) {
  const root = parse(html);
  const meta = (name: string) =>
    root.querySelector(`meta[itemprop="${name}"]`)?.getAttribute("content") ?? "";
  const description = root.querySelector('[itemprop="description"]')?.structuredText.trim() ?? "";
  const posted = new Date(meta("datePosted"));
  return {
    title: root.querySelector('[itemprop="title"]')?.text.trim() ?? "",
    location: meta("streetAddress"),
    company: meta("hiringOrganization") || "Government of Alberta",
    postedAt: Number.isNaN(posted.getTime()) ? null : posted.toISOString(),
    description,
    pay: parsePayText(description.match(/salary[^\n]*\n?[^\n]*/i)?.[0]),
  };
}

export function createAlbertaSource(fetcher: Fetcher = httpFetcher, pause = sleep): SearchSource {
  // The site map is the same for every query in a run; read it once per hour at most.
  let cached: { entries: SitemapEntry[]; at: number } | undefined;
  return {
    kind: "search",
    async search(query: SearchQuery) {
      if (!cached || Date.now() - cached.at > 3_600_000) {
        cached = { entries: parseSitemap(await fetcher.text(sitemapUrl)), at: Date.now() };
      }
      const wanted = city(query.location);
      const matches = cached.entries.filter(
        (e) => city(e.city) === wanted && titleMatches(e.title, [query.title]),
      );
      const postings: unknown[] = [];
      for (const entry of matches) {
        await pause(2000);
        postings.push({ url: entry.url, ...parsePostingPage(await fetcher.text(entry.url)) });
      }
      return postings;
    },
  };
}
