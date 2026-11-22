import { z } from "zod";
import { type Fetcher, httpFetcher, sleep } from "./http";
import { titleMatches } from "./match";
import { parsePayText } from "./pay-text";
import type { CompanyFeedSource } from "./source";

/**
 * Workday career sites ({tenant}.wd{N}.myworkdayjobs.com/{site}). Their public JSON API
 * lists postings 20 at a time; each posting's details are a second request, so only
 * postings whose titles someone is looking for are fetched. A board id is
 * "tenant/wdN/site", read from the careers link a member pastes.
 */

export type WorkdayBoard = { tenant: string; wd: string; site: string };

const careersUrl =
  /^https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/i;

/** Reads a Workday careers link, e.g. https://suncor.wd1.myworkdayjobs.com/en-US/Suncor_External. */
export function parseWorkdayUrl(url: string): WorkdayBoard | null {
  const match = url.trim().match(careersUrl);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const site = match[3];
  // "job" and "details" are paths under a site, never a site name.
  if (["job", "details", "wday"].includes(site.toLowerCase())) return null;
  return { tenant: match[1].toLowerCase(), wd: match[2].toLowerCase(), site };
}

export const workdayBoardId = (b: WorkdayBoard) => `${b.tenant}/${b.wd}/${b.site}`;

export function readWorkdayBoardId(boardId: string): WorkdayBoard | null {
  const [tenant, wd, site] = boardId.split("/");
  return tenant && wd && site ? { tenant, wd, site } : null;
}

export const workdayCareersUrl = (b: WorkdayBoard) =>
  `https://${b.tenant}.${b.wd}.myworkdayjobs.com/${b.site}`;

const apiBase = (b: WorkdayBoard) =>
  `https://${b.tenant}.${b.wd}.myworkdayjobs.com/wday/cxs/${b.tenant}/${b.site}`;

const listSchema = z.object({
  total: z.number().optional(),
  jobPostings: z.array(
    z.object({
      title: z.string(),
      externalPath: z.string(),
      locationsText: z.string().nullish(),
    }),
  ),
});

const detailSchema = z.object({
  jobPostingInfo: z.object({
    title: z.string(),
    jobDescription: z.string().nullish(),
    location: z.string().nullish(),
    startDate: z.string().nullish(),
    timeType: z.string().nullish(),
    externalUrl: z.string().nullish(),
    remoteType: z.string().nullish(),
    jobRequisitionLocation: z.object({ descriptor: z.string() }).nullish(),
  }),
  hiringOrganization: z.object({ name: z.string().nullish() }).nullish(),
});

const htmlToText = (html: string) =>
  html
    .replace(/<\/(p|li|h\d|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Workday locations come in many shapes: "CA-AB-Calgary", "Calgary, AB, CAN",
 * "Lloydminster (SK)". Turn the common ones into "City, XX".
 */
export function workdayLocation(text: string): string {
  const code = text.match(/^([A-Z]{2})-([A-Z]{2})-(.+)$/);
  if (code?.[3]) return `${code[3].replace(/-/g, " ")}, ${code[2]}`;
  const bracket = text.match(/^(.+?)\s*\(([A-Z]{2})\)$/);
  if (bracket?.[1]) return `${bracket[1]}, ${bracket[2]}`;
  return text.replace(/,\s*CAN$/, "");
}

/** One posting's details as a scraped posting. */
export function parseWorkdayPosting(raw: unknown, board: WorkdayBoard, company: string): unknown {
  const { jobPostingInfo: info, hiringOrganization } = detailSchema.parse(raw);
  const description = htmlToText(info.jobDescription ?? "");
  const place = info.jobRequisitionLocation?.descriptor ?? info.location ?? "";
  return {
    url: info.externalUrl ?? workdayCareersUrl(board),
    title: info.title,
    company: company || hiringOrganization?.name || board.tenant,
    location: workdayLocation(place),
    remote: /remote/i.test(`${info.remoteType ?? ""} ${place}`) ? "remote" : "unknown",
    description,
    postedAt: info.startDate ?? null,
    pay: parsePayText(description.match(/\$\s?[\d,.]+[^\n]{0,80}/)?.[0]),
  };
}

const pageSize = 20;
const maxPages = 15;

export function createWorkdaySource(
  fetcher: Fetcher = httpFetcher,
  pause: (ms: number) => Promise<void> = sleep,
): CompanyFeedSource {
  return {
    kind: "company-feed",
    async listCompany({ boardId, name, titles }) {
      const board = readWorkdayBoardId(boardId);
      if (!board) throw new Error(`not a Workday board id: ${boardId}`);
      if (!fetcher.postJson) throw new Error("this fetcher can't POST");
      const base = apiBase(board);
      const wanted: { title: string; externalPath: string }[] = [];
      let total = Number.POSITIVE_INFINITY;
      for (let page = 0; page < maxPages && page * pageSize < total; page++) {
        if (page > 0) await pause(1000);
        const list = listSchema.parse(
          await fetcher.postJson(`${base}/jobs`, {
            appliedFacets: {},
            limit: pageSize,
            offset: page * pageSize,
            searchText: "",
          }),
        );
        // Workday only reports the total on the first page.
        if (page === 0) total = list.total ?? list.jobPostings.length;
        wanted.push(...list.jobPostings.filter((p) => !titles || titleMatches(p.title, titles)));
        if (list.jobPostings.length < pageSize) break;
      }
      const postings: unknown[] = [];
      for (const posting of wanted) {
        await pause(1000);
        postings.push(
          parseWorkdayPosting(await fetcher.json(`${base}${posting.externalPath}`), board, name),
        );
      }
      return postings;
    },
  };
}

/** Confirms a Workday board answers, for adding it as a watched company. */
export async function workdayBoardExists(board: WorkdayBoard, fetcher: Fetcher): Promise<boolean> {
  if (!fetcher.postJson) return false;
  try {
    listSchema.parse(
      await fetcher.postJson(`${apiBase(board)}/jobs`, {
        appliedFacets: {},
        limit: 1,
        offset: 0,
        searchText: "",
      }),
    );
    return true;
  } catch {
    return false;
  }
}
