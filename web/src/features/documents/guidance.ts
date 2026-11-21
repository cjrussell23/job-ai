import { type Advice, charsPerLine } from "@/features/profile/strength";

export type { Advice };

/**
 * Rules of thumb for resume length, shown in the builder as advice, never enforced.
 * They follow common Canadian recruiter guidance: one page under about eight years of
 * experience, three to five bullets for recent roles, fewer for older ones, and bullets
 * of one or two lines.
 */

const yearOf = (date: string, now: Date): number | null => {
  if (/present|current|now/i.test(date)) return now.getFullYear();
  const match = date.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
};

export type EntryForAdvice = {
  type: "role" | "project";
  startDate: string;
  endDate: string;
  /** Position among the member's roles, newest first; 0 is the current or latest role. */
  rank: number;
};

/** The recommended number of bullets for one role or project. */
export function bulletRange(entry: EntryForAdvice, now = new Date()): { min: number; max: number } {
  if (entry.type === "project") return { min: 1, max: 3 };
  const ended = yearOf(entry.endDate, now) ?? yearOf(entry.startDate, now);
  const yearsAgo = ended === null ? 0 : now.getFullYear() - ended;
  if (yearsAgo > 10) return { min: 0, max: 2 };
  if (entry.rank <= 1 && yearsAgo <= 2) return { min: 3, max: 6 };
  return { min: 2, max: 4 };
}

export function bulletCountAdvice(count: number, range: { min: number; max: number }): Advice {
  const wanted = range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;
  if (count > range.max) {
    return {
      status: "warn",
      message: `${count} bullets; ${wanted} is typical here. Keep the strongest.`,
    };
  }
  if (count < range.min) {
    return { status: "warn", message: `${count} bullets; ${wanted} is typical here.` };
  }
  return { status: "good", message: `${count} bullets` };
}

/** Whole years since the earliest role began. */
export function yearsOfExperience(roleStarts: string[], now = new Date()): number {
  const years = roleStarts.map((d) => yearOf(d, now)).filter((y): y is number => y !== null);
  return years.length ? now.getFullYear() - Math.min(...years) : 0;
}

export function recommendedPages(years: number): 1 | 2 {
  return years >= 8 ? 2 : 1;
}

export function skillsAdvice(count: number): Advice | null {
  if (count > 20) {
    return {
      status: "warn",
      message: `${count} skills. Recruiters skim this line; 10–20 that fit the jobs you want read better.`,
    };
  }
  return null;
}

export function pageAdvice(estimated: number, target: number): Advice {
  if (estimated > target) {
    return {
      status: "warn",
      message: `About ${estimated} pages, over your ${target}-page target. Drop older bullets, use a compact layout, or raise the target.`,
    };
  }
  return { status: "good", message: `Fits on ${target === 1 ? "one page" : `${target} pages`}.` };
}

export type FitCandidate = {
  id: string;
  text: string;
  /** How many bullets the entry has beyond its recommended maximum. */
  excess: number;
  /** Years since the entry ended; older entries give way first. */
  age: number;
};

/** Lines a bullet takes at roughly the standard density. */
export const linesFor = (text: string) => Math.max(1, Math.ceil(text.length / charsPerLine));

/**
 * Bullets to drop to save `linesToSave` lines: first from entries over their
 * recommended count, then the oldest entries, then the longest bullets.
 */
export function fitSuggestions(candidates: FitCandidate[], linesToSave: number): FitCandidate[] {
  const ordered = [...candidates].sort(
    (a, b) => b.excess - a.excess || b.age - a.age || b.text.length - a.text.length,
  );
  const picked: FitCandidate[] = [];
  let saved = 0;
  for (const c of ordered) {
    if (saved >= linesToSave) break;
    picked.push(c);
    saved += linesFor(c.text);
  }
  return picked;
}

export { yearOf as yearOfDate };
