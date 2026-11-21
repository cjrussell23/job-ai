import { bulletAdvice, bulletStrength, entryStrength } from "@/features/profile/strength";
import { bulletRange } from "./guidance";

/**
 * A resume's score out of 100, from rules anyone can check: no model call. Each aspect
 * says what would raise it.
 */

export type ScoreInput = {
  pages: number;
  targetPages: number;
  entries: { kind: "role" | "project"; bullets: string[]; range: { min: number; max: number } }[];
  contact: { email: boolean; phone: boolean; location: boolean; links: number };
  hasSummary: boolean;
  skills: number;
};

export type Aspect = {
  key: "length" | "impact" | "wording" | "structure" | "consistency" | "completeness";
  label: string;
  weight: number;
  score: number;
  detail: string;
};

export type ResumeScore = { total: number; aspects: Aspect[] };

const pct = (part: number, whole: number) => (whole === 0 ? 100 : Math.round((part / whole) * 100));
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function scoreResume(input: ScoreInput): ResumeScore {
  const bullets = input.entries.flatMap((e) => e.bullets);
  const withNumber = bullets.filter((b) => /\d/.test(b)).length;
  const clean = bullets.filter(
    (b) => !bulletAdvice(b) && !bulletStrength(b).some((a) => a.status === "warn"),
  ).length;
  const inRange = input.entries.filter(
    (e) => e.bullets.length >= e.range.min && e.bullets.length <= e.range.max,
  ).length;
  const consistent = input.entries.filter((e) => entryStrength(e.bullets).length === 0).length;
  const checks = [
    input.contact.email,
    input.contact.phone,
    input.contact.location,
    input.contact.links > 0,
    input.hasSummary,
    input.skills >= 8 && input.skills <= 25,
  ];
  const missing = [
    !input.contact.phone && "a phone number",
    !input.contact.location && "your city",
    input.contact.links === 0 && "a LinkedIn or portfolio link",
    !input.hasSummary && "a summary",
    (input.skills < 8 || input.skills > 25) && "8–25 skills",
  ].filter(Boolean);
  const over = input.pages - input.targetPages;

  const aspects: Aspect[] = [
    {
      key: "length",
      label: "Length",
      weight: 15,
      score: over <= 0 ? 100 : clamp(100 - over * 45),
      detail:
        over <= 0
          ? `Fits your ${input.targetPages}-page target.`
          : `About ${input.pages} pages against a ${input.targetPages}-page target.`,
    },
    {
      key: "impact",
      label: "Impact",
      weight: 20,
      // Most strong resumes put a number in at least half of their bullets.
      score: clamp((withNumber / Math.max(1, bullets.length) / 0.5) * 100),
      detail: `${withNumber} of ${bullets.length} bullets have a number (time, money, users, %). Aim for half.`,
    },
    {
      key: "wording",
      label: "Wording",
      weight: 20,
      score: pct(clean, bullets.length),
      detail: `${clean} of ${bullets.length} bullets pass the length and wording checks. Fix the rest on your profile.`,
    },
    {
      key: "structure",
      label: "Structure",
      weight: 15,
      score: pct(inRange, input.entries.length),
      detail: `${inRange} of ${input.entries.length} roles and projects have a typical number of bullets.`,
    },
    {
      key: "consistency",
      label: "Consistency",
      weight: 10,
      score: pct(consistent, input.entries.length),
      detail: `${consistent} of ${input.entries.length} keep one tense and vary their opening verbs.`,
    },
    {
      key: "completeness",
      label: "Completeness",
      weight: 20,
      score: pct(checks.filter(Boolean).length, checks.length),
      detail: missing.length
        ? `Add ${missing.join(", ")}.`
        : "Contact details, links, summary and skills are all there.",
    },
  ];
  const total = Math.round(
    aspects.reduce((sum, a) => sum + a.score * a.weight, 0) /
      aspects.reduce((sum, a) => sum + a.weight, 0),
  );
  return { total, aspects };
}

/**
 * The same score for a saved resume body, e.g. a tailored one. Entries in a section
 * headed like "Experience" count as roles, in the order shown; the rest as projects.
 */
export function scoreBody(
  body: import("./body").ResumeBody,
  pages: number,
  targetPages = 1,
  now = new Date(),
): ResumeScore {
  let rank = 0;
  const entries: ScoreInput["entries"] = body.sections.flatMap((section) => {
    const isRole = /experience|employment|work history/i.test(section.heading);
    return section.entries
      .filter((e) => e.lines.length > 0 || isRole)
      .map((e) => {
        const [startDate = "", endDate = startDate] = e.dates.split(" – ");
        const kind = isRole ? ("role" as const) : ("project" as const);
        const range = bulletRange(
          { type: kind, startDate, endDate, rank: isRole ? rank++ : -1 },
          now,
        );
        return { kind, bullets: e.lines.map((l) => l.text), range };
      });
  });
  const parts = body.contactParts ?? [];
  const has = (kind: "email" | "phone" | "location") =>
    parts.length ? parts.some((p) => p.kind === kind) : kind === "email" && body.contact !== "";
  const skills = body.skills.flatMap((l) => l.text.split(/[,·]/)).filter((s) => s.trim()).length;
  return scoreResume({
    pages,
    targetPages,
    entries,
    contact: {
      email: has("email"),
      phone: has("phone"),
      location: has("location"),
      links: body.links.length,
    },
    hasSummary: body.summary.length > 0,
    skills,
  });
}
