import { z } from "zod";
import { type Fetcher, httpFetcher } from "./http";
import { parsePayText } from "./pay-text";
import type { CompanyFeedSource } from "./source";

/** Public, unauthenticated per-company job board feeds. */

const htmlToText = (html: string) =>
  html
    .replace(/<\/(p|li|h\d|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const remoteFrom = (text: string | null | undefined) => {
  const value = (text ?? "").toLowerCase();
  if (value.includes("remote")) return "remote";
  if (value.includes("hybrid")) return "hybrid";
  if (value.includes("on-site") || value.includes("onsite") || value.includes("in office"))
    return "onsite";
  return "unknown";
};

const greenhouseFeed = z.object({
  jobs: z.array(
    z.object({
      title: z.string(),
      absolute_url: z.string(),
      location: z.object({ name: z.string() }).nullish(),
      content: z.string().nullish(),
      first_published: z.string().nullish(),
      updated_at: z.string().nullish(),
      company_name: z.string().nullish(),
    }),
  ),
});

export function parseGreenhouse(raw: unknown, companyName: string): unknown[] {
  return greenhouseFeed.parse(raw).jobs.map((job) => {
    // Greenhouse escapes the HTML in `content`.
    const description = htmlToText(htmlToText(job.content ?? ""));
    return {
      url: job.absolute_url,
      title: job.title,
      company: job.company_name ?? companyName,
      location: job.location?.name ?? "",
      remote: remoteFrom(job.location?.name),
      description,
      postedAt: job.first_published ?? job.updated_at ?? null,
      pay: parsePayText(description.match(/\$[\d,.]+[^\n]{0,60}/)?.[0]),
    };
  });
}

const leverFeed = z.array(
  z.object({
    text: z.string(),
    hostedUrl: z.string(),
    categories: z.object({ location: z.string().nullish() }).nullish(),
    descriptionPlain: z.string().nullish(),
    additionalPlain: z.string().nullish(),
    createdAt: z.number().nullish(),
    workplaceType: z.string().nullish(),
    salaryRange: z
      .object({
        min: z.number().nullish(),
        max: z.number().nullish(),
        interval: z.string().nullish(),
      })
      .nullish(),
  }),
);

export function parseLever(raw: unknown, companyName: string): unknown[] {
  return leverFeed.parse(raw).map((job) => {
    const interval = job.salaryRange?.interval ?? "";
    const period = interval.includes("hour")
      ? "hour"
      : interval.includes("month")
        ? "month"
        : "year";
    return {
      url: job.hostedUrl,
      title: job.text,
      company: companyName,
      location: job.categories?.location ?? "",
      remote: remoteFrom(job.workplaceType),
      description: [job.descriptionPlain, job.additionalPlain].filter(Boolean).join("\n\n"),
      postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
      pay:
        job.salaryRange?.min || job.salaryRange?.max
          ? { min: job.salaryRange.min ?? null, max: job.salaryRange.max ?? null, period }
          : null,
    };
  });
}

const ashbyFeed = z.object({
  jobs: z.array(
    z.object({
      title: z.string(),
      jobUrl: z.string(),
      location: z.string().nullish(),
      isRemote: z.boolean().nullish(),
      workplaceType: z.string().nullish(),
      descriptionPlain: z.string().nullish(),
      publishedAt: z.string().nullish(),
      isListed: z.boolean().nullish(),
      compensation: z
        .object({ scrapeableCompensationSalarySummary: z.string().nullish() })
        .nullish(),
    }),
  ),
});

export function parseAshby(raw: unknown, companyName: string): unknown[] {
  return ashbyFeed
    .parse(raw)
    .jobs.filter((job) => job.isListed !== false)
    .map((job) => ({
      url: job.jobUrl,
      title: job.title,
      company: companyName,
      location: job.location ?? "",
      remote: job.workplaceType
        ? remoteFrom(job.workplaceType)
        : job.isRemote
          ? "remote"
          : "unknown",
      description: job.descriptionPlain ?? "",
      postedAt: job.publishedAt ?? null,
      pay: parsePayText(job.compensation?.scrapeableCompensationSalarySummary),
    }));
}

export const boardFeedUrl = {
  greenhouse: (board: string) =>
    `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,
  lever: (board: string) => `https://api.lever.co/v0/postings/${board}?mode=json`,
  ashby: (board: string) =>
    `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`,
};

const parsers = { greenhouse: parseGreenhouse, lever: parseLever, ashby: parseAshby };

export type BoardSystem = keyof typeof parsers;

export function createBoardSource(
  system: BoardSystem,
  fetcher: Fetcher = httpFetcher,
): CompanyFeedSource {
  return {
    kind: "company-feed",
    async listCompany({ boardId, name }) {
      return parsers[system](await fetcher.json(boardFeedUrl[system](boardId)), name);
    },
  };
}

/** Reads a company board link: which system, and the company's board id. */
export function parseBoardUrl(url: string): { system: BoardSystem; boardId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const first = parsed.pathname.split("/").filter(Boolean)[0];
  if (!first) {
    // Greenhouse also serves boards as ?for=board on its embed host.
    const embedded = parsed.searchParams.get("for");
    return host.endsWith("greenhouse.io") && embedded
      ? { system: "greenhouse", boardId: embedded }
      : null;
  }
  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    return { system: "greenhouse", boardId: first };
  }
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co")
    return { system: "lever", boardId: first };
  if (host === "jobs.ashbyhq.com") return { system: "ashby", boardId: first };
  return null;
}
