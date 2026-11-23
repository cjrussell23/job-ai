import { z } from "zod";
import { type FontKey, fontKeys } from "./fonts";

/** The blocks a standing resume can arrange. */
export const sectionKeys = [
  "experience",
  "workProjects",
  "personalProjects",
  "skills",
  "education",
] as const;
export type SectionKey = (typeof sectionKeys)[number];

export const sectionLabels: Record<SectionKey, string> = {
  experience: "Experience",
  workProjects: "Work projects",
  personalProjects: "Personal projects",
  skills: "Skills",
  education: "Education and certifications",
};

export const densities = ["compact", "standard", "roomy"] as const;
export type Density = (typeof densities)[number];

export const densityLabels: Record<Density, string> = {
  compact: "Compact",
  standard: "Standard",
  roomy: "Roomy",
};

/** Font size, line height and page margins for each density, in points and inches. */
export const densityStyles: Record<
  Density,
  { fontPt: number; lineHeight: number; marginIn: { y: number; x: number } }
> = {
  compact: { fontPt: 9.5, lineHeight: 1.3, marginIn: { y: 0.45, x: 0.55 } },
  standard: { fontPt: 10.5, lineHeight: 1.4, marginIn: { y: 0.6, x: 0.7 } },
  roomy: { fontPt: 11, lineHeight: 1.5, marginIn: { y: 0.75, x: 0.8 } },
};

/** Puts every section key in the list once, keeping the member's order first. */
function completeOrder(order: SectionKey[]): SectionKey[] {
  const seen = [...new Set(order)];
  return [...seen, ...sectionKeys.filter((k) => !seen.includes(k))];
}

export const templates = ["clean", "classic", "harvard", "modern", "minimal"] as const;
export type Template = (typeof templates)[number];
export const templateLabels: Record<Template, string> = {
  clean: "Clean (sans-serif)",
  classic: "Classic (serif, centred header)",
  harvard: "Harvard (traditional, serif)",
  modern: "Modern (accent colour)",
  minimal: "Minimal (no rules)",
};

/** What each template uses unless the member picks otherwise. */
export const templateDefaults: Record<Template, { font: FontKey; accent: string; namePt: number }> =
  {
    clean: { font: "arimo", accent: "#333333", namePt: 18 },
    classic: { font: "gelasio", accent: "#111111", namePt: 20 },
    harvard: { font: "tinos", accent: "#000000", namePt: 16 },
    modern: { font: "lato", accent: "#1d4ed8", namePt: 22 },
    minimal: { font: "carlito", accent: "#444444", namePt: 18 },
  };

const inches = z.number().min(0.3).max(1.5);

export const layoutSchema = z.object({
  /** The length the member is aiming for. The builder warns past it; nothing is cut. */
  pages: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  density: z.enum(densities).default("standard"),
  template: z.enum(templates).default("clean"),
  order: z
    .array(z.enum(sectionKeys))
    .default([...sectionKeys])
    .transform(completeOrder),
  /** Section headings the member renamed; anything missing uses the default label. */
  headings: z.partialRecord(z.enum(sectionKeys), z.string().trim().max(60)).default({}),
  /** Several titles at one employer print under one employer heading. */
  groupRoles: z.boolean().default(true),
  showDates: z.boolean().default(true),
  /** Sections that start on a new page; elsewhere pages break where the content allows. */
  breakBefore: z.array(z.enum(sectionKeys)).default([]),
  /** Links print as their address ("linkedin.com/in/you") or as a label ("LinkedIn"). */
  headerLinks: z.enum(["address", "label"]).default("address"),
  /** Small icons before the email, phone, location and each link. */
  headerIcons: z.boolean().default(false),
  /** Profile item ids in the member's order for this resume; others follow in profile order. */
  itemOrder: z.array(z.uuid()).max(500).default([]),
  /** The title each role shows, chosen from its own title and alternates. */
  titles: z.record(z.uuid(), z.string().max(300)).default({}),
  /** Bullets printed in their short version. */
  short: z.array(z.uuid()).max(500).default([]),
  /** The profile summary shown at the top, if any. */
  summaryId: z.uuid().nullable().default(null),
  /** "template" uses the template's own font. */
  font: z.enum(["template", ...fontKeys]).default("template"),
  /** Body text size in points; null lets the spacing choice decide. */
  fontSize: z.number().min(8).max(13).nullable().default(null),
  /** Page margins in inches; null lets the spacing choice decide. */
  margins: z.object({ y: inches, x: inches }).nullable().default(null),
  /** Colour for the name and headings; null uses the template's. */
  accent: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable()
    .default(null),
  /** Print the name and contact details at the top of every page, not just the first. */
  repeatHeader: z.boolean().default(false),
  pageNumbers: z.boolean().default(false),
});
export type Layout = z.infer<typeof layoutSchema>;

export const defaultLayout: Layout = layoutSchema.parse({});

/** A saved layout, or the default for documents saved before layouts existed. */
export function readLayout(raw: unknown): Layout {
  const parsed = layoutSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : defaultLayout;
}

export type ResolvedStyle = {
  font: FontKey;
  fontPt: number;
  lineHeight: number;
  marginIn: { y: number; x: number };
  accent: string;
  namePt: number;
  /** Extra top margin holding a header repeated on every page; 0 when it isn't. */
  headerIn: number;
  /** Extra bottom margin holding page numbers; 0 when there are none. */
  footerIn: number;
};

/** Pure: every number the renderers need, from the template, spacing and the member's overrides. */
export function resolvedStyle(layout: Layout): ResolvedStyle {
  const d = densityStyles[layout.density];
  const t = templateDefaults[layout.template];
  const contactPt = 9.5;
  return {
    font: layout.font === "template" ? t.font : layout.font,
    fontPt: layout.fontSize ?? d.fontPt,
    lineHeight: d.lineHeight,
    marginIn: layout.margins ?? d.marginIn,
    accent: layout.accent ?? t.accent,
    namePt: t.namePt,
    headerIn: layout.repeatHeader ? (t.namePt * 1.25 + contactPt * 1.6 + 4) / 72 + 0.25 : 0,
    footerIn: layout.pageNumbers ? 0.25 : 0,
  };
}
