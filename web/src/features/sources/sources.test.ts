import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { closeDb } from "@/db/client";
import { parsePlace } from "@/lib/places";
import { resetDb } from "@/test/db";
import { createAlbertaSource, parseSitemap } from "./alberta";
import { createBoardSource, parseBoardUrl } from "./company-boards";
import {
  createGcJobsSource,
  departmentName,
  hasPage,
  parseGcPay,
  parsePostingPage,
  parseResults,
  pickLocationCode,
  postingLocation,
} from "./gcjobs";
import type { Fetcher } from "./http";
import { createJobBankSource, feedLocation, parseFeed } from "./jobbank";
import { locationMatches, titleMatches, titleMatchesLoosely } from "./match";
import { parsePayText } from "./pay-text";
import { parsePostings } from "./source";
import {
  addDiscoveredCompanies,
  addWatchedCompany,
  listWatchedCompanies,
} from "./watched-companies";
import { createWorkdaySource, workdayLocation } from "./workday";

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
  test("the loose match needs the role word and half the rest", () => {
    expect(titleMatchesLoosely("Developer, Applications", ["Software Developer"])).toBe(true);
    expect(titleMatchesLoosely("Senior Systems Analyst", ["IT Systems Analyst"])).toBe(true);
    expect(titleMatchesLoosely("Policy Analyst", ["Full Stack Software Developer"])).toBe(false);
    expect(titleMatchesLoosely("Web Designer", ["Full Stack Web Developer"])).toBe(false);
    // "Full stack" only qualifies, so this is a "Web Developer" search: any developer fits.
    expect(titleMatchesLoosely("Application Developer", ["Full Stack Web Developer"])).toBe(true);
    expect(titleMatchesLoosely("Senior Policy Analyst", ["Data Quality Analyst"])).toBe(false);
    expect(titleMatchesLoosely("Web Applications Developer", ["Full Stack Web Developer"])).toBe(
      true,
    );
  });

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

describe("GC Jobs", () => {
  test("reads the results fragment", () => {
    const entries = parseResults(fixture("gcjobs-results.html"));
    expect(entries).toHaveLength(5);
    expect(entries[1]).toMatchObject({
      posterId: "2476904",
      title: "Painter / Sign Painter",
      department: "National Defence - Assistant Deputy Minister (Infrastructure & Environment)",
      salary: "GL-PCF-06: $32.31 to $35.14 / GL-PCF-07: $33.42 to $36.35",
    });
    expect(entries[1]?.locations).toMatch(/^Cold Lake \(Alberta\), Wainwright/);
    expect(departmentName(entries[1]?.department ?? "")).toBe("National Defence");
    expect(hasPage(fixture("gcjobs-results.html"), 2)).toBe(true);
    expect(hasPage(fixture("gcjobs-results.html"), 7)).toBe(false);
  });

  test("maps listed locations to one place", () => {
    const listed = "Cold Lake (Alberta), Wainwright (Alberta), Dundurn (Saskatchewan)";
    expect(postingLocation(listed, parsePlace("Alberta"))).toBe("Cold Lake, AB");
    expect(postingLocation(listed, parsePlace("Dundurn, SK"))).toBe("Dundurn, SK");
    expect(postingLocation("Bagotville (Québec)", null)).toBe("Bagotville, QC");
    expect(postingLocation("Various Locations", parsePlace("Calgary, AB"))).toBe("Canada");
  });

  test("reads pay from salary text", () => {
    expect(parseGcPay("$113,272 to $133,262")).toEqual({
      min: 113272,
      max: 133262,
      period: "year",
    });
    expect(parseGcPay("GL-PCF-06: $32.31 to $35.14 / GL-PCF-07: $33.42 to $36.35")).toEqual({
      min: 32.31,
      max: 35.14,
      period: "hour",
    });
    expect(parseGcPay("$140,315 to $170,718 (Subject to revision.)")?.max).toBe(170718);
    expect(parseGcPay("")).toBeNull();
  });

  test("reads a posting page, or the link when it is advertised elsewhere", () => {
    const page = parsePostingPage(fixture("gcjobs-posting.html"));
    expect(page.applyUrl).toBeNull();
    expect(page.description).toContain("About the position");
    expect(page.description).toContain("You need");
    const external = parsePostingPage(fixture("gcjobs-external.html"));
    expect(external.description).toBe("");
    expect(external.applyUrl).toMatch(/^https:\/\/careers\.bankofcanada\.ca\//);
  });

  test("picks the location code for a city or province", () => {
    const options = [
      { LOCATION_CD: "W", LOCATION_DESC: "Calgary (Alberta)", LOCATION_ID: 134 },
      {
        LOCATION_CD: "W",
        LOCATION_DESC: "Calgary International Airport (Alberta)",
        LOCATION_ID: 9,
      },
      { LOCATION_CD: "P", LOCATION_DESC: "Alberta", LOCATION_ID: 5 },
    ];
    const at = (text: string) => {
      const place = parsePlace(text);
      return place ? pickLocationCode(place, options) : undefined;
    };
    expect(at("Calgary, AB")).toBe("W134");
    expect(at("Alberta")).toBe("P5");
    expect(at("Calgary, BC")).toBeNull();
  });

  test("searches through one session and reads each posting", async () => {
    const requested: string[] = [];
    let sessions = 0;
    const newSession = () => {
      sessions++;
      return {
        text: async (url: string) => {
          requested.push(url);
          if (url.includes("fromMenu=true")) {
            return "<script>setNetworkAvailability('ABC123',true,'x');</script>";
          }
          if (url.includes("ajaxFilter=Calgary")) {
            return JSON.stringify([
              { LOCATION_CD: "W", LOCATION_DESC: "Calgary (Alberta)", LOCATION_ID: 134 },
            ]);
          }
          if (url.includes("isSecondPartOfPage=1")) return fixture("gcjobs-results.html");
          if (url.includes("search=Search") || url.includes("requestedPage=")) {
            return "<html>search page</html>";
          }
          if (url.includes("page1800?poster=2479295")) return fixture("gcjobs-external.html");
          if (url.includes("page1800")) return fixture("gcjobs-posting.html");
          throw new Error(`unexpected ${url}`);
        },
      };
    };
    const source = createGcJobsSource(newSession, noPause);
    const raw = await source.search({ title: "painter", location: "Calgary, AB" });
    const { postings, rejected } = parsePostings(raw);
    expect(rejected).toBe(0);
    // Every page serves the same sample, so repeats are dropped.
    expect(postings).toHaveLength(5);
    const painter = postings.find((p) => p.title === "Painter / Sign Painter");
    expect(painter).toMatchObject({
      url: "https://emploisfp-psjobs.cfp-psc.gc.ca/psrs-srfp/applicant/page1800?poster=2476904&toggleLanguage=en",
      company: "National Defence",
      location: "Cold Lake, AB",
      pay: { min: 32.31, max: 35.14, period: "hour" },
    });
    expect(painter?.description).toContain("About the position");
    expect(postings[0]).toMatchObject({ location: "Canada", description: "" });
    expect(postings[0]?.applyUrl).toMatch(/bankofcanada/);

    const submit = requested.find((u) => u.includes("search=Search"));
    expect(submit).toContain(";jsessionid=ABC123?");
    expect(submit).toContain("location=W134");
    expect(submit).toContain("title=painter");
    // Pages 2 and 3 were read; the sample links to six.
    expect(
      requested.filter((u) => u.includes("requestedPage=") && u.includes("isSecond")),
    ).toHaveLength(2);
    // A second query reuses the session and the cached location code.
    await source.search({ title: "painter", location: "Calgary, AB" });
    expect(sessions).toBe(1);
    expect(requested.filter((u) => u.includes("ajaxFilter"))).toHaveLength(1);
  });

  test("finds nothing for a place outside Canada or one it cannot locate", async () => {
    const newSession = () => ({
      text: async (url: string) =>
        url.includes("fromMenu") ? "setNetworkAvailability('ABC123',true)" : "[]",
    });
    const source = createGcJobsSource(newSession, noPause);
    expect(await source.search({ title: "painter", location: "United States" })).toEqual([]);
    expect(await source.search({ title: "painter", location: "Nowhere, AB" })).toEqual([]);
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

describe("Workday", () => {
  test("careers links become board ids", () => {
    expect(
      parseBoardUrl("https://suncor.wd1.myworkdayjobs.com/en-US/Suncor_External/job/Welder_R1"),
    ).toEqual({
      system: "workday",
      boardId: "suncor/wd1/Suncor_External",
    });
    expect(parseBoardUrl("https://cenovus.wd3.myworkdayjobs.com/careers")).toEqual({
      system: "workday",
      boardId: "cenovus/wd3/careers",
    });
    expect(workdayLocation("CA-AB-Calgary")).toBe("Calgary, AB");
    expect(workdayLocation("Lloydminster (SK)")).toBe("Lloydminster, SK");
    expect(workdayLocation("Calgary, AB, CAN")).toBe("Calgary, AB");
  });

  test("lists pages, fetches only postings with a wanted title, and reads their details", async () => {
    const posted: { url: string; body: unknown }[] = [];
    const requested: string[] = [];
    const fetcher: Fetcher = {
      text: async () => {
        throw new Error("not used");
      },
      json: async (url) => {
        requested.push(url);
        return JSON.parse(fixture("workday-posting.json"));
      },
      postJson: async (url, body) => {
        posted.push({ url, body });
        return JSON.parse(fixture("workday-list.json"));
      },
    };
    const raw = await createWorkdaySource(fetcher, noPause).listCompany({
      boardId: "cenovus/wd3/careers",
      name: "Cenovus Energy",
      titles: ["Health Center Nurse"],
    });
    expect(posted[0]?.url).toBe(
      "https://cenovus.wd3.myworkdayjobs.com/wday/cxs/cenovus/careers/jobs",
    );
    // The sample's total is 22, so a second page is read.
    expect(posted).toHaveLength(2);
    expect(requested.every((u) => u.includes("/wday/cxs/cenovus/careers/job/"))).toBe(true);
    const { postings, rejected } = parsePostings(raw);
    expect(rejected).toBe(0);
    expect(postings.length).toBeGreaterThan(0);
    expect(postings[0]).toMatchObject({
      company: "Cenovus Energy",
      location: "Lloydminster, SK",
      title: "Senior Coordinator, OT SCADA",
    });
    expect(postings[0]?.postedAt?.toISOString().slice(0, 10)).toBe("2026-11-20");
  });
});
