/**
 * Advice on the wording of profile items, shown where they can be edited: the profile.
 * Never enforced; a member may keep a bullet as it is.
 */

export type Advice = { status: "good" | "warn"; message: string };

/** Characters on one line of a Letter page at the standard density. */
export const charsPerLine = 100;

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

const presentVerbs = new Set(
  "lead build manage develop design create oversee collaborate maintain run write own drive support implement deliver architect automate integrate improve coordinate mentor review deploy monitor secure partner plan launch migrate".split(
    " ",
  ),
);

export const isPresentTense = (word: string) => presentVerbs.has(word);

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
  // Only words that are clearly present-tense verbs count; "Primary developer…" is not a tense.
  const present = openers.filter(isPresentTense).length;
  if (openers.length >= 3 && past >= 1 && present >= 1) {
    advice.push({
      status: "warn",
      message: "Mixes tenses. Use one: present for a current role, past for earlier ones.",
    });
  }
  return advice;
}
