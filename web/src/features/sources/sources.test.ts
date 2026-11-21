import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { closeDb } from "@/db/client";
import { resetDb } from "@/test/db";
import { createAlbertaSource, parseSitemap } from "./alberta";
import { createBoardSource, parseBoardUrl } from "./company-boards";
import type { Fetcher } from "./http";
import { createJobBankSource, feedLocation, parseFeed } from "./jobbank";
import { locationMatches, titleMatches } from "./match";
import { parsePayText } from "./pay-text";
import { parsePostings } from "./source";
import {
  addDiscoveredCompanies,
  addWatchedCompany,
  listWatchedCompanies,
} from "./watched-companies";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");

/** Serves saved samples by URL pattern, and records what was asked for. */
function fakeFetcher(routes: [RegExp, string][]) {
  const requested: string[] = [];
  const find = (url: string) => {
    requested.push(url);
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) throw new Error(`no fixture for ${url}`);
    return fixture(route[1]);
  };
  const fetcher: Fetcher = {
    text: async (url) => find(url),
    json: async (url) => JSON.parse(find(url)),
  };
  return { fetcher, requested };
}
const noPause = async () => {};

describe("matching helpers", () => {
  test("a search title matches postings containing all its words", () => {
    expect(titleMatches("Senior Backend Engineer II", ["Backend Engineer"])).toBe(true);
    expect(titleMatches("Backend Engineering Manager", ["Backend Engineer"])).toBe(false);
    expect(titleMatches("Barista", ["Cafe Attendant", "Barista"])).toBe(true);
  });

  test("locations match on the searched city, province or country", () => {
    expect(locationMatches("Calgary, AB", "Calgary, Alberta")).toBe(true);
    expect(locationMatches("Edmonton, AB", "Calgary, AB")).toBe(false);
    expect(locationMatches("Calgary", "")).toBe(false);
    expect(locationMatches("Edmonton, AB", "Alberta")).toBe(true);
    expect(locationMatches("Toronto, ON", "Canada")).toBe(true);
  });

  test("pay written as text", () => {
    expect(parsePayText("$100,000.00 to $120,000.00 annually (to be negotiated)")).toEqual({
      min: 100000,
      max: 120000,
      period: "year",
    });
    expect(parsePayText("$19.50 hourly")).toEqual({ min: 19.5, max: 19.5, period: "hour" });
    expect(parsePayText("$90K – $110K a year")).toEqual({
      min: 90000,
      max: 110000,
      period: "year",
    });
    expect(parsePayText("$2,265.79 to $2,866.95 bi-weekly")).toEqual({
      min: 58911,
      max: 74541,
      period: "year",
    });
    expect(parsePayText("Competitive")).toBeNull();
  });
});

describe("Job Bank", () => {
  test("reads the feed's entries", () => {
    const entries = parseFeed(fixture("jobbank-feed.xml"));
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      title: "front-end developer",
      url: "https://www.jobbank.gc.ca/jobsearch/jobposting/50770814",
      location: "Kirkland (QC)",
      employer: "Future Electronics",
    });
    expect(feedLocation("Kirkland (QC)")).toBe("Kirkland, QC");
  });

  test("keeps only postings in the searched city and reads their pages", async () => {
    const { fetcher, requested } = fakeFetcher([
      [/jobSearchRSSfeed/, "jobbank-feed.xml"],
      [/jobposting\/50770814/, "jobbank-posting.html"],
    ]);
    const raw = await createJobBankSource(fetcher, noPause).search({
      title: "developer",
      location: "Kirkland, QC",
    });
    const { postings, rejected } = parsePostings(raw);
    expect(rejected).toBe(0);
    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      company: "Future Electronics",
      location: "Kirkland, QC",
      remote: "hybrid",
      pay: { min: 100000, max: 120000, period: "year" },
    });
    expect(postings[0]?.description).toContain("Bachelor's degree");
    // The postings in other cities were never fetched.
    expect(requested.filter((u) => u.includes("jobposting"))).toHaveLength(1);
  });
});

describe("Government of Alberta", () => {
  test("reads city and title from the site map links", () => {
    const entries = parseSitemap(fixture("alberta-sitemap.xml"));
    expect(entries[0]).toMatchObject({
      city: "Edmonton",
      title: "Manager, AI Harness Engineering",
    });
    expect(entries.some((e) => e.city === "Calgary")).toBe(true);
    // Two-word cities stay whole.
    const twoWords = parseSitemap(
      "<urlset><url><loc>https://jobpostings.alberta.ca/job/Red-Deer-Policy-Analyst/123/</loc></url></urlset>",
    );
    expect(twoWords[0]).toMatchObject({ city: "Red Deer", title: "Policy Analyst" });
  });

  test("fetches only matching postings and reads their pages", async () => {
    const { fetcher, requested } = fakeFetcher([
      [/sitemap\.xml/, "alberta-sitemap.xml"],
      [/\/job\//, "alberta-posting.html"],
    ]);
    const raw = await createAlbertaSource(fetcher, noPause).search({
      title: "AI Harness Engineering",
      location: "Edmonton, AB",
    });
    const { postings, rejected } = parsePostings(raw);
    expect(rejected).toBe(0);
    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      title: "Manager, AI Harness Engineering",
      company: "Government of Alberta",
      location: "Edmonton, AB",
    });
    expect(postings[0]?.description.length).toBeGreaterThan(100);
    expect(requested.filter((u) => u.includes("/job/"))).toHaveLength(1);
  });
});

describe("company boards", () => {
  test.each([
    ["greenhouse", "greenhouse.json", /greenhouse/],
    ["lever", "lever.json", /lever/],
    ["ashby", "ashby.json", /ashbyhq/],
  ] as const)("%s postings parse into the common shape", async (system, file, pattern) => {
    const { fetcher } = fakeFetcher([[pattern, file]]);
    const raw = await createBoardSource(system, fetcher).listCompany({
      boardId: "acme",
      name: "Acme",
    });
    const { postings, rejected } = parsePostings(raw);
    expect(rejected).toBe(0);
    expect(postings.length).toBeGreaterThan(0);
    for (const posting of postings) {
      expect(posting.title).not.toBe("");
      expect(posting.description.length).toBeGreaterThan(50);
      expect(posting.description).not.toMatch(/<\/?(p|div|li)>/);
    }
  });

  test("board links are recognised", () => {
    expect(parseBoardUrl("https://boards.greenhouse.io/acme/jobs/1")).toEqual({
      system: "greenhouse",
      boardId: "acme",
    });
    expect(parseBoardUrl("https://job-boards.greenhouse.io/acme")).toEqual({
      system: "greenhouse",
      boardId: "acme",
    });
    expect(parseBoardUrl("https://jobs.lever.co/acme/123")).toEqual({
      system: "lever",
      boardId: "acme",
    });
    expect(parseBoardUrl("https://jobs.ashbyhq.com/acme")).toEqual({
      system: "ashby",
      boardId: "acme",
    });
    expect(parseBoardUrl("https://acme.com/careers")).toBeNull();
  });
});

describe("watched companies", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  test("a member adds a company from its board link; the name comes from Greenhouse", async () => {
    const { fetcher } = fakeFetcher([[/greenhouse/, "greenhouse.json"]]);
    const result = await addWatchedCompany("https://boards.greenhouse.io/gitlab", { fetcher });
    expect(result).toMatchObject({
      ok: true,
      company: { name: "GitLab", system: "greenhouse", boardId: "gitlab" },
    });
    expect(
      await addWatchedCompany("https://job-boards.greenhouse.io/gitlab/jobs/1", { fetcher }),
    ).toEqual({
      ok: false,
      reason: "already_watched",
    });
  });

  test("links that are not boards, or boards that cannot be read, are refused", async () => {
    const { fetcher } = fakeFetcher([]);
    expect(await addWatchedCompany("https://acme.com/careers", { fetcher })).toEqual({
      ok: false,
      reason: "not_a_board",
    });
    expect(await addWatchedCompany("https://jobs.lever.co/nobody", { fetcher })).toEqual({
      ok: false,
      reason: "board_not_found",
    });
  });

  test("boards linked from postings are watched automatically, once each", async () => {
    const { fetcher } = fakeFetcher([[/lever/, "lever.json"]]);
    const added = await addDiscoveredCompanies(
      [
        "https://jobs.lever.co/acme-labs/1",
        "https://jobs.lever.co/acme-labs/2",
        "https://example.com",
      ],
      fetcher,
    );
    expect(added).toBe(1);
    const [company] = await listWatchedCompanies();
    expect(company).toMatchObject({ name: "Acme Labs", origin: "discovered" });
  });
});
