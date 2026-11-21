import { parse } from "node-html-parser";
import { type Fetcher, httpFetcher, sleep } from "./http";
import { locationMatches } from "./match";
import { parsePayText } from "./pay-text";
import type { SearchQuery, SearchSource } from "./source";

/**
 * Job Bank (jobbank.gc.ca). Its public Atom feed searches by keyword but ignores
 * location, so each title's last week of postings is read nationally and kept
 * only when they are in the searched place. Each kept posting's page is then read for
 * the description, at most one request every five seconds (its robots.txt asks for that).
 */

const feedUrl = (title: string) =>
  `https://www.jobbank.gc.ca/jobsearch/feed/jobSearchRSSfeed?searchstring=${encodeURIComponent(title)}&sort=D&fage=7&rows=100`;

export type FeedEntry = {
  title: string;
  url: string;
  updated: string;
  location: string;
  employer: string;
  salary: string;
};

// The HTML parser does not understand CDATA, so unwrap it (escaping its content) first.
const unwrapCdata = (xml: string) =>
  xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, content: string) =>
    content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  );

export function parseFeed(xml: string): FeedEntry[] {
  const root = parse(unwrapCdata(xml));
  return root.querySelectorAll("entry").map((entry) => {
    // The summary is HTML escaped inside the XML; .text unescapes it, then it is parsed as HTML.
    const summary = parse(entry.querySelector("summary")?.text ?? "").text;
    // One "Label: value" per line.
    const fields = new Map(
      summary.split("\n").map((line) => {
        const at = line.indexOf(":");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()] as const;
      }),
    );
    const field = (label: string) => fields.get(label) ?? "";
    return {
      title: entry.querySelector("title")?.text.trim() ?? "",
      url: entry.querySelector("link")?.getAttribute("href") ?? "",
      updated: entry.querySelector("updated")?.text ?? "",
      location: field("Location"),
      employer: field("Employer"),
      salary: field("Salary"),
    };
  });
}

/** "Kirkland (QC)" -> "Kirkland, QC". */
export function feedLocation(location: string): string {
  return location.replace(/\s*\((\w\w)\)\s*$/, ", $1").trim();
}

export function parsePostingPage(html: string) {
  const root = parse(html);
  const prop = (name: string) => root.querySelector(`[property="${name}"]`);
  const description = prop("description")?.text.trim() ?? "";
  const workplace = description.match(/Workplace information:\s*([A-Za-z-]+)/)?.[1]?.toLowerCase();
  const hours = description.match(/(\d{1,2}(?:\.\d+)?)\s*hours per week/i)?.[1];
  return {
    description,
    remote:
      workplace === "remote"
        ? "remote"
        : workplace === "hybrid"
          ? "hybrid"
          : workplace
            ? "onsite"
            : "unknown",
    hoursPerWeek: hours ? Math.round(Number.parseFloat(hours)) : null,
  } as const;
}

export function createJobBankSource(fetcher: Fetcher = httpFetcher, pause = sleep): SearchSource {
  return {
    kind: "search",
    async search(query: SearchQuery) {
      const entries = parseFeed(await fetcher.text(feedUrl(query.title))).filter((e) =>
        locationMatches(feedLocation(e.location), query.location),
      );
      const postings: unknown[] = [];
      for (const entry of entries) {
        await pause(5000);
        const page = parsePostingPage(await fetcher.text(entry.url));
        postings.push({
          url: entry.url,
          title: entry.title,
          company: entry.employer,
          location: feedLocation(entry.location),
          postedAt: entry.updated || null,
          pay: parsePayText(entry.salary),
          ...page,
        });
      }
      return postings;
    },
  };
}
