import { inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { scrapeRuns } from "@/db/schema";
import type { SearchQuery } from "@/features/sources/source";

export type TargetSearch = {
  searchTitles: string[];
  locations: string[];
  workplace: "remote_only" | "local_or_remote" | "local_only";
};

/** Remote-only targets search the whole country. */
export const remoteLocation = "Canada";

/**
 * Turns every active target's approved titles and places into searches, once each:
 * two members wanting "Barista" in Calgary share one search.
 */
export function buildQueries(targets: TargetSearch[]): SearchQuery[] {
  const seen = new Map<string, SearchQuery>();
  for (const target of targets) {
    const places = target.workplace === "remote_only" ? [remoteLocation] : target.locations;
    for (const title of target.searchTitles) {
      for (const location of places) {
        const key = `${title.trim().toLowerCase()}|${location.trim().toLowerCase()}`;
        if (!seen.has(key)) seen.set(key, { title: title.trim(), location: location.trim() });
      }
    }
  }
  return [...seen.values()];
}

/** Every approved title, for filtering company boards that list all their jobs. */
export function allTitles(targets: TargetSearch[]): string[] {
  return [...new Set(targets.flatMap((t) => t.searchTitles))];
}

/** Which of these search titles a daily run has searched at least once, lowercased. */
export async function searchedTitles(titles: string[]): Promise<Set<string>> {
  const wanted = [...new Set(titles.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return new Set();
  const rows = await db()
    .selectDistinct({ query: sql<string>`lower(${scrapeRuns.query})` })
    .from(scrapeRuns)
    .where(inArray(sql`lower(${scrapeRuns.query})`, wanted));
  return new Set(rows.map((r) => r.query));
}
