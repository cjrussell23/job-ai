import { inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { scrapeRuns } from "@/db/schema";
import type { SearchQuery } from "@/features/sources/source";
import { parsePlace } from "@/lib/places";

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

/**
 * The same place however it was written: "Calgary" and "Calgary, AB" are one city,
 * "AB" and "Alberta" one province. Older runs logged places before they were canonical.
 */
function placeKey(text: string): string {
  const place = parsePlace(text);
  if (!place) return text.trim().toLowerCase();
  if (place.kind === "city") return `city:${place.city.trim().toLowerCase()}`;
  return place.kind === "province" ? `province:${place.province}` : `country:${place.country}`;
}

/**
 * Whether a daily run has searched this target yet: at least one of its own searches
 * (a title in one of its places) has a scrape run. Titles alone aren't enough, since
 * targets often share titles but not places.
 */
export async function searchedTargets(
  targets: (TargetSearch & { id: string })[],
): Promise<Set<string>> {
  const keyOf = (q: SearchQuery) => `${q.title.trim().toLowerCase()}|${placeKey(q.location)}`;
  const wanted = new Map(targets.map((t) => [t.id, buildQueries([t]).map(keyOf)]));
  const titles = [
    ...new Set(targets.flatMap((t) => t.searchTitles.map((s) => s.trim().toLowerCase()))),
  ];
  if (titles.length === 0) return new Set();
  const rows = await db()
    .selectDistinct({
      query: sql<string>`lower(${scrapeRuns.query})`,
      location: sql<string>`lower(${scrapeRuns.location})`,
    })
    .from(scrapeRuns)
    .where(inArray(sql`lower(${scrapeRuns.query})`, titles));
  const done = new Set(rows.map((r) => `${r.query}|${placeKey(r.location)}`));
  return new Set([...wanted].filter(([, keys]) => keys.some((k) => done.has(k))).map(([id]) => id));
}
