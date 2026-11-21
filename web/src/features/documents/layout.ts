import { z } from "zod";

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

export const layoutSchema = z.object({
  /** The length the member is aiming for. The builder warns past it; nothing is cut. */
  pages: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  density: z.enum(densities).default("standard"),
  order: z
    .array(z.enum(sectionKeys))
    .default([...sectionKeys])
    .transform(completeOrder),
});
export type Layout = z.infer<typeof layoutSchema>;

export const defaultLayout: Layout = layoutSchema.parse({});

/** A saved layout, or the default for documents saved before layouts existed. */
export function readLayout(raw: unknown): Layout {
  const parsed = layoutSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : defaultLayout;
}
