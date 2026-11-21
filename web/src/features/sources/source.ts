import { z } from "zod";

/**
 * Every job source sits behind this interface (CLAUDE.md rule 8), so a broken one
 * can be swapped without touching the rest of the app.
 */

export const scrapedPostingSchema = z.object({
  url: z.url(),
  /** The employer's own application link, when a job board gives one. */
  applyUrl: z.url().nullable().default(null),
  title: z.string().trim().min(1),
  company: z.string().trim().min(1),
  location: z.string().trim().default(""),
  remote: z.enum(["remote", "hybrid", "onsite", "unknown"]).default("unknown"),
  description: z.string().default(""),
  postedAt: z.coerce.date().nullable().default(null),
  pay: z
    .object({
      min: z.number().positive().nullable(),
      max: z.number().positive().nullable(),
      period: z.enum(["hour", "day", "week", "month", "year"]),
    })
    .nullable()
    .default(null),
  hoursPerWeek: z.number().int().positive().max(80).nullable().default(null),
});
export type ScrapedPosting = z.infer<typeof scrapedPostingSchema>;

/** One search: a job title near a place. */
export type SearchQuery = { title: string; location: string };

/** A board searched by title and location (Indeed, LinkedIn, Job Bank, Alberta). */
export type SearchSource = {
  kind: "search";
  search: (query: SearchQuery) => Promise<unknown[]>;
};

/** A company's own career feed, listed in full and filtered locally (Greenhouse, Lever, Ashby). */
export type CompanyFeedSource = {
  kind: "company-feed";
  listCompany: (company: { boardId: string; name: string }) => Promise<unknown[]>;
};

export type SourceImplementation = SearchSource | CompanyFeedSource;

export type ParseResult = { postings: ScrapedPosting[]; rejected: number };

/** Validates raw source output; bad rows are counted, never saved. */
export function parsePostings(raw: unknown[]): ParseResult {
  const postings: ScrapedPosting[] = [];
  let rejected = 0;
  for (const row of raw) {
    const parsed = scrapedPostingSchema.safeParse(row);
    if (parsed.success) postings.push(parsed.data);
    else rejected++;
  }
  return { postings, rejected };
}
