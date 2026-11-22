import { parse } from "node-html-parser";
import { z } from "zod";
import { type Place, parsePlace, placeContains, provinceName, provinceOf } from "@/lib/places";
import { sleep, userAgent } from "./http";
import type { ScrapedPosting, SearchQuery, SearchSource } from "./source";

/**
 * GC Jobs (emploisfp-psjobs.cfp-psc.gc.ca), the federal public service's job board.
 * It has no feed or API: searches go through a server-side session (a JSESSIONID in
 * both the URL and a cookie), and the results arrive as an HTML fragment. One session
 * is kept per run and reused across queries, every request is sequential with a pause,
 * and each result's posting page is read for its description.
 */

const host = "https://emploisfp-psjobs.cfp-psc.gc.ca";
const searchPage = `${host}/psrs-srfp/applicant/page2440`;
const maxPages = 3;
// Sessions expire on the server after an hour of use or so; renew a little before.
const sessionLifetimeMs = 50 * 60_000;

/** Fetches pages while keeping cookies and following redirects, like a browser tab. */
export type CookieSession = { text: (url: string) => Promise<string> };

/** A real cookie-carrying session. The global fetch keeps no cookies between calls. */
export function createCookieSession(): CookieSession {
  // Per host, so a redirect elsewhere never carries this site's session cookie.
  const jars = new Map<string, Map<string, string>>();
  return {
    async text(url) {
      let current = url;
      for (let hop = 0; hop < 6; hop++) {
        const at = new URL(current);
        const jar = jars.get(at.host) ?? new Map<string, string>();
        jars.set(at.host, jar);
        const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
        const response = await fetch(current, {
          headers: { "user-agent": userAgent, ...(cookie ? { cookie } : {}) },
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
        });
        for (const header of response.headers.getSetCookie()) {
          const pair = header.split(";")[0] ?? "";
          const eq = pair.indexOf("=");
          if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
        }
        const location = response.headers.get("location");
        if (response.status >= 300 && response.status < 400 && location) {
          current = new URL(location, current).href;
          continue;
        }
        if (!response.ok) throw new Error(`${response.status} from ${at.host}`);
        return response.text();
      }
      throw new Error(`too many redirects from ${new URL(url).host}`);
    },
  };
}

/** The session id the search page hands its own scripts. */
export function readSessionId(html: string): string | null {
  return html.match(/setNetworkAvailability\('([0-9A-Fa-f]+)'/)?.[1] ?? null;
}

const lostConnection = (html: string) => /Lost Connection/i.test(html);

const locationOptionsSchema = z.array(
  z.object({
    LOCATION_CD: z.string(),
    LOCATION_DESC: z.string(),
    LOCATION_ID: z.number(),
  }),
);

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** The text typed into the site's location filter for a place, or null for all of Canada. */
function locationFilterText(place: Place): string | null {
  switch (place.kind) {
    case "country":
      return null;
    case "province":
      return provinceName(place.province);
    case "city":
      return place.city;
  }
}

/**
 * Picks the site's location code from its filter suggestions: "Calgary (Alberta)" for a
 * city in Alberta, "Alberta" for the province. Codes join the letter and the id ("W134").
 */
export function pickLocationCode(place: Place, optionsJson: unknown): string | null {
  const parsed = locationOptionsSchema.safeParse(optionsJson);
  if (!parsed.success) return null;
  const wanted = (desc: string) => {
    const d = fold(desc);
    switch (place.kind) {
      case "country":
        return false;
      case "province":
        return d === fold(provinceName(place.province));
      case "city":
        return place.province
          ? d === fold(`${place.city} (${provinceName(place.province)})`)
          : d.startsWith(`${fold(place.city)} (`);
    }
  };
  const option = parsed.data.find((o) => wanted(o.LOCATION_DESC));
  return option ? `${option.LOCATION_CD}${option.LOCATION_ID}` : null;
}

export type ResultEntry = {
  posterId: string;
  title: string;
  department: string;
  locations: string;
  salary: string;
};

/** Reads the results fragment's `li.searchResult` items. */
export function parseResults(html: string): ResultEntry[] {
  return parse(html)
    .querySelectorAll("li.searchResult")
    .flatMap((li) => {
      const link = li.querySelector("a");
      const posterId = link?.getAttribute("href")?.match(/poster=(\d+)/)?.[1];
      if (!link || !posterId) return [];
      const [left, right] = li.querySelectorAll(".tableCell").map((cell) =>
        cell.structuredText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      );
      // Left cell: closing date, department, locations. Right: language, salary.
      const rest = (left ?? []).filter((line) => !/^Closing date:/i.test(line));
      return [
        {
          posterId,
          title: link.text.trim(),
          department: rest[0] ?? "",
          locations: rest[1] ?? "",
          salary: (right ?? []).find((line) => line.includes("$")) ?? "",
        },
      ];
    });
}

/** Whether the results link to a given page number. */
export function hasPage(html: string, page: number): boolean {
  return html.includes(`requestedPage=${page}&`);
}

/** "National Defence - Assistant Deputy Minister (...)" -> "National Defence". */
export function departmentName(department: string): string {
  return department.split(" - ")[0]?.trim() ?? "";
}

/**
 * "Cold Lake (Alberta), Wainwright (Alberta)" -> "Cold Lake, AB", or the first listed
 * place inside the searched one; "Various Locations" -> "Canada".
 */
export function postingLocation(locations: string, searched: Place | null): string {
  const text = locations.replace(/\s+/g, " ").trim();
  if (/^various locations$/i.test(text)) return "Canada";
  const labels = [...text.matchAll(/([^,()]+?)\s*\(([^)]+)\)/g)].map((m) => {
    const city = (m[1] ?? "").trim();
    const province = provinceOf(m[2] ?? "");
    return province ? `${city}, ${province}` : `${city} (${m[2] ?? ""})`;
  });
  const inside = searched ? labels.find((label) => placeContains(searched, label)) : undefined;
  return inside ?? labels[0] ?? text;
}

/**
 * The first "$a to $b" range. Ranges are often per classification level with no period
 * written ("GL-PCF-06: $32.31 to $35.14 / ..."), so the size of the amount decides it.
 */
export function parseGcPay(salary: string): ScrapedPosting["pay"] {
  const match = salary.match(/\$\s*([\d,]+(?:\.\d+)?)(?:\s*to\s*\$\s*([\d,]+(?:\.\d+)?))?/i);
  if (!match?.[1]) return null;
  const min = Number.parseFloat(match[1].replace(/,/g, ""));
  const max = match[2] ? Number.parseFloat(match[2].replace(/,/g, "")) : min;
  if (!(min > 0) || !(max > 0)) return null;
  return { min, max, period: min >= 1000 ? "year" : "hour" };
}

const sectionIds = ["aboutPosition", "youNeed", "mayNeedAsset", "conditionEmp"];

/**
 * A posting page's description. Some departments advertise on their own site, and the
 * page is then only a notice linking there; that link is the apply link.
 */
export function parsePostingPage(html: string): { description: string; applyUrl: string | null } {
  const root = parse(html);
  const description = sectionIds
    .map((id) => root.querySelector(`#${id}`)?.structuredText.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
  if (description) return { description, applyUrl: null };
  const leaving = /You will leave the/i.test(root.querySelector("h1")?.text ?? "");
  const external = leaving
    ? root
        .querySelectorAll("main p a")
        .map((a) => a.getAttribute("href") ?? "")
        .find((href) => /^https?:\/\//.test(href) && !href.includes("cfp-psc.gc.ca"))
    : undefined;
  return { description: "", applyUrl: external ?? null };
}

export const postingUrl = (posterId: string) =>
  `${host}/psrs-srfp/applicant/page1800?poster=${posterId}&toggleLanguage=en`;

export function createGcJobsSource(
  newSession: () => CookieSession = createCookieSession,
  pause = sleep,
): SearchSource {
  let current: { http: CookieSession; id: string; at: number } | undefined;
  // Location codes don't change; look each place up once.
  const codes = new Map<string, string | null>();

  async function session(renew = false) {
    if (!renew && current && Date.now() - current.at < sessionLifetimeMs) return current;
    const http = newSession();
    const id = readSessionId(await http.text(`${searchPage}?fromMenu=true&toggleLanguage=en`));
    if (!id) throw new Error("GC Jobs gave no session id");
    current = { http, id, at: Date.now() };
    return current;
  }

  /** One request through the session, renewing it once if the server dropped it. */
  async function get(query: string): Promise<string> {
    let s = await session();
    await pause(2000);
    let html = await s.http.text(`${searchPage};jsessionid=${s.id}?${query}`);
    if (lostConnection(html)) {
      s = await session(true);
      await pause(2000);
      html = await s.http.text(`${searchPage};jsessionid=${s.id}?${query}`);
      if (lostConnection(html)) throw new Error("GC Jobs session lost");
    }
    return html;
  }

  async function locationCode(place: Place): Promise<string | null> {
    const text = locationFilterText(place);
    if (text === null) return "";
    const key = fold(text) + (place.kind === "city" ? `|${place.province ?? ""}` : "");
    if (!codes.has(key)) {
      const body = await get(`ajaxFilter=${encodeURIComponent(text)}`);
      let json: unknown = null;
      try {
        json = JSON.parse(body);
      } catch {
        json = null;
      }
      codes.set(key, pickLocationCode(place, json));
    }
    return codes.get(key) ?? null;
  }

  return {
    kind: "search",
    async search(query: SearchQuery) {
      const place = parsePlace(query.location);
      // Federal jobs are in Canada; a place outside it has nothing here.
      if (!place || (place.kind === "country" && place.country !== "Canada")) return [];
      const code = await locationCode(place);
      // An unknown place would otherwise search all of Canada.
      if (code === null) return [];

      const criteria = new URLSearchParams({
        tab: "1",
        title: query.title,
        locationsFilter: "",
        location: code,
        search: "Search jobs",
      }).toString();
      await get(criteria);
      let html = await get(`${criteria}&log=false&isSecondPartOfPage=1&isInitialNetworkCheck=1`);
      const entries = parseResults(html);
      for (let page = 2; page <= maxPages && hasPage(html, page); page++) {
        const pageQuery = `requestedPage=${page}&fromPage=${page - 1}&tab=1&log=false`;
        await get(pageQuery);
        html = await get(`${pageQuery}&isSecondPartOfPage=1`);
        entries.push(...parseResults(html));
      }

      const postings: unknown[] = [];
      const seen = new Set<string>();
      for (const entry of entries) {
        if (seen.has(entry.posterId)) continue;
        seen.add(entry.posterId);
        const url = postingUrl(entry.posterId);
        await pause(2000);
        // One unreadable posting page shouldn't lose the rest; the listing has the essentials.
        const page = await (await session()).http
          .text(url)
          .then(parsePostingPage)
          .catch(() => ({ description: "", applyUrl: null }));
        postings.push({
          url,
          applyUrl: page.applyUrl,
          title: entry.title,
          company: departmentName(entry.department),
          location: postingLocation(entry.locations, place),
          description: page.description,
          pay: parseGcPay(entry.salary),
        });
      }
      return postings;
    },
  };
}
