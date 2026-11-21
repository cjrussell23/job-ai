/**
 * Rules of thumb for resume length, shown in the builder as advice, never enforced.
 * They follow common Canadian recruiter guidance: one page under about eight years of
 * experience, three to five bullets for recent roles, fewer for older ones, and bullets
 * of one or two lines.
 */

export type Advice = { status: "good" | "warn"; message: string };

/** Characters on one line of a Letter page at the standard density. */
export const charsPerLine = 100;

const yearOf = (date: string, now: Date): number | null => {
  if (/present|current|now/i.test(date)) return now.getFullYear();
  const match = date.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
};

export function bulletAdvice(text: string): Advice | null {
  const length = text.trim().length;
  if (length > charsPerLine * 2) {
    return {
      status: "warn",
      message: `About ${Math.ceil(length / charsPerLine)} lines. Aim for one or two: cut the context and keep the result.`,
    };
  }
  if (length < 40) {
    return { status: "warn", message: "Very short. Say what you did and what it achieved." };
  }
  return null;
}

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

const weakOpeners = [
  "responsible for",
  "helped",
  "helped with",
  "worked on",
  "assisted",
  "involved in",
  "tasked with",
  "duties included",
  "participated in",
];

/** Common irregular past-tense verbs that start resume bullets. */
const irregularPast = new Set(
  "built led ran wrote set made cut grew drove took won began brought bought chose did found gave got held kept knew lost met paid put rebuilt rewrote sold sent shot spent stood taught thought told understood undertook upheld oversaw overtook undertook".split(
    " ",
  ),
);

export const isPastTense = (word: string) =>
  irregularPast.has(word) ||
  (word.endsWith("ed") && !["need", "feed", "seed", "speed", "lead"].includes(word));

const firstWord = (text: string) =>
  text
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
    .replace(/[^a-z]/g, "") ?? "";

/** Checks on one bullet's wording, as advice. */
export function bulletStrength(text: string): Advice[] {
  const lower = text.trim().toLowerCase();
  const advice: Advice[] = [];
  const weak = weakOpeners.find((w) => lower.startsWith(w));
  if (weak) {
    advice.push({
      status: "warn",
      message: `Starts with "${weak}". Lead with what you did: built, cut, launched, automated.`,
    });
  }
  if (/\b(i|my|me)\b/.test(lower)) {
    advice.push({
      status: "warn",
      message: 'Uses "I" or "my". Resume bullets usually leave them out.',
    });
  }
  if (!/\d/.test(lower)) {
    advice.push({
      status: "good",
      message: "No number. Add one if you have it: time saved, users, %, money.",
    });
  }
  return advice;
}

/** Checks across one entry's bullets: repeated openers and mixed tenses. */
export function entryStrength(bullets: string[]): Advice[] {
  const advice: Advice[] = [];
  const openers = bullets.map(firstWord).filter(Boolean);
  const counts = new Map<string, number>();
  for (const word of openers) counts.set(word, (counts.get(word) ?? 0) + 1);
  const repeated = [...counts].filter(([, n]) => n >= 3).map(([w]) => w);
  if (repeated.length) {
    advice.push({
      status: "warn",
      message: `${repeated.map((w) => `"${w}"`).join(", ")} starts 3 or more bullets. Vary the verbs.`,
    });
  }
  const past = openers.filter(isPastTense).length;
  const present = openers.length - past;
  if (openers.length >= 3 && past >= 1 && present >= 1) {
    advice.push({
      status: "warn",
      message: "Mixes tenses. Use one: present for a current role, past for earlier ones.",
    });
  }
  return advice;
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
