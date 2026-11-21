import { z } from "zod";

/**
 * Where a line came from (CLAUDE.md rule 1):
 * - profile: a profile item's own words
 * - reworded: the model lightly rephrased the listed profile items
 * - edited: the member changed a sourced line
 * - user_written: the member typed it; no profile item stands behind it
 */
export const lineOrigin = z.enum(["profile", "reworded", "edited", "user_written"]);

export const lineSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(2000),
  sources: z.array(z.uuid()),
  origin: lineOrigin,
});
export type Line = z.infer<typeof lineSchema>;

export const resumeEntrySchema = z.object({
  id: z.string().min(1),
  /** The role, project or certification the entry shows, if any. */
  itemId: z.uuid().nullable(),
  title: z.string(),
  subtitle: z.string(),
  dates: z.string(),
  /** A web link printed with the entry, e.g. a project's live site. */
  url: z.string().optional(),
  lines: z.array(lineSchema),
});
export type ResumeEntry = z.infer<typeof resumeEntrySchema>;

/** A clickable link in the header, e.g. LinkedIn. Older bodies have none. */
export const headerLinkSchema = z.object({ label: z.string(), url: z.string() });

/** Contact details one by one, for icons; older bodies only have the joined `contact`. */
export const contactPartSchema = z.object({
  kind: z.enum(["email", "phone", "location"]),
  text: z.string(),
});

export const resumeBodySchema = z.object({
  kind: z.literal("resume"),
  name: z.string(),
  contact: z.string(),
  links: z.array(headerLinkSchema).default([]),
  contactParts: z.array(contactPartSchema).optional(),
  /** A short summary at the top; empty to leave it out. */
  summary: z.array(lineSchema),
  sections: z.array(
    z.object({
      id: z.string().min(1),
      heading: z.string().min(1),
      /** Which builder section this is, e.g. "experience"; absent on tailored resumes. */
      key: z.string().optional(),
      /** Start this section on a new page. */
      breakBefore: z.boolean().optional(),
      /** Consecutive entries with the same employer may print under one heading. */
      groupable: z.boolean().optional(),
      entries: z.array(resumeEntrySchema),
    }),
  ),
  skills: z.array(lineSchema),
  /** Start the skills block on a new page. */
  skillsBreakBefore: z.boolean().optional(),
  /** A renamed skills heading; absent means "Skills". */
  skillsHeading: z.string().optional(),
  /** Where the skills block sits among the sections; absent means after them all. */
  skillsAt: z.number().int().min(0).optional(),
});
export type ResumeBody = z.infer<typeof resumeBodySchema>;

export const coverLetterBodySchema = z.object({
  kind: z.literal("cover_letter"),
  name: z.string(),
  contact: z.string(),
  links: z.array(headerLinkSchema).default([]),
  contactParts: z.array(contactPartSchema).optional(),
  greeting: z.string(),
  paragraphs: z.array(lineSchema),
  closing: z.string(),
});
export type CoverLetterBody = z.infer<typeof coverLetterBodySchema>;

export const documentBodySchema = z.discriminatedUnion("kind", [
  resumeBodySchema,
  coverLetterBodySchema,
]);
export type DocumentBody = z.infer<typeof documentBodySchema>;

/** Every line in a body, wherever it sits. */
export function allLines(body: DocumentBody): Line[] {
  if (body.kind === "cover_letter") return body.paragraphs;
  return [
    ...body.summary,
    ...body.sections.flatMap((s) => s.entries.flatMap((e) => e.lines)),
    ...body.skills,
  ];
}

/** Lines the member wrote, for offering to save them to the profile. */
export function userWrittenLines(body: DocumentBody): Line[] {
  return allLines(body).filter((l) => l.origin === "user_written");
}

let counter = 0;
/** Short ids for lines and entries, unique within a body. */
export function newId(prefix = "l"): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}
