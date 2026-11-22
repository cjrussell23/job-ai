import { normalizeLocation, normalizeTitle } from "@/features/jobs/identity";
import { parsePlace, placeContains } from "@/lib/places";

const fillerWords = new Set(["and", "of", "the", "a", "an", "to", "for", "in", "i", "ii", "iii"]);

function words(title: string): string[] {
  return normalizeTitle(title)
    .split(/[\s/]+/)
    .filter((w) => w.length > 1 && !fillerWords.has(w));
}

/**
 * Whether a posting's title fits one of the search titles: every meaningful word of
 * a search title appears in the posting title ("Backend Engineer" fits "Senior
 * Backend Engineer II"). Used where a source lists everything and we filter locally.
 */
export function titleMatches(postingTitle: string, searchTitles: string[]): boolean {
  const have = new Set(words(postingTitle));
  return searchTitles.some((search) => {
    const want = words(search);
    return want.length > 0 && want.every((w) => have.has(w));
  });
}

/** Words that say how senior or which kind, not what the role is. */
const qualifiers = new Set([
  "senior",
  "junior",
  "intermediate",
  "lead",
  "principal",
  "staff",
  "associate",
  "assistant",
  "chief",
  "head",
  "entry",
  "level",
  "full",
  "stack",
  "time",
  "part",
  "temporary",
  "permanent",
]);

/**
 * A looser fit for employers whose titles follow their own conventions, like the
 * Government of Alberta ("Developer, Applications" for a "Software Developer"): the
 * role word (the last meaningful word of the search title) must appear, plus at least
 * half of the search title's other meaningful words.
 */
export function titleMatchesLoosely(postingTitle: string, searchTitles: string[]): boolean {
  if (titleMatches(postingTitle, searchTitles)) return true;
  const have = new Set(words(postingTitle));
  return searchTitles.some((search) => {
    const want = words(search).filter((w) => !qualifiers.has(w));
    const role = want.at(-1);
    if (!role || !have.has(role)) return false;
    const rest = want.slice(0, -1);
    const shared = rest.filter((w) => have.has(w)).length;
    return rest.length === 0 || shared >= Math.ceil(rest.length / 2) || rest.length === 1;
  });
}

/** The city part of a place, e.g. "Calgary, AB" -> "calgary". */
export function city(location: string): string {
  return normalizeLocation(location.split(/[,(]/)[0] ?? "");
}

/** Whether a posting's location is inside the searched place: a city, province or country. */
export function locationMatches(postingLocation: string, searchLocation: string): boolean {
  const place = parsePlace(searchLocation);
  return place !== null && placeContains(place, postingLocation);
}
