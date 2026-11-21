import type { ProfileItem } from "@/features/profile/profile";
import { type Line, newId, type ResumeBody, resumeBodySchema } from "./body";
import { defaultLayout, type Layout, type SectionKey, sectionLabels } from "./layout";

/** The fields a standing resume reads; safe to send to the browser for the live preview. */
export type BuildableItem = Pick<
  ProfileItem,
  | "id"
  | "type"
  | "parentId"
  | "title"
  | "organization"
  | "content"
  | "startDate"
  | "endDate"
  | "visibility"
  | "position"
>;

const dates = (item: BuildableItem) => [item.startDate, item.endDate].filter(Boolean).join(" – ");

/** Items a standing resume may show: everything except items kept off resumes. */
export function resumeItems<T extends BuildableItem>(items: T[]): T[] {
  return items.filter((i) => i.visibility !== "never" && i.visibility !== "cover_letter_only");
}

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * A project done for one of the member's employers (its "For" field names a role's
 * employer) is work; anything else is personal.
 */
export function isWorkProject(project: BuildableItem, employers: Set<string>): boolean {
  return project.organization !== "" && employers.has(norm(project.organization));
}

const ownWords = (text: string, sources: string[]): Line => ({
  id: newId("l"),
  text,
  sources,
  origin: "profile",
});

/**
 * A standing resume from the items the member picked, in profile order. Every line is
 * an item's own words, so its sources are exact (rule 1). A bullet shows only under a
 * picked role or project.
 */
export function buildStandingBody(
  items: BuildableItem[],
  picked: Set<string>,
  header: { name: string; contact: string; links: { label: string; url: string }[] },
  layout: Layout = defaultLayout,
): ResumeBody {
  const usable = resumeItems(items).filter((i) => picked.has(i.id));
  const bulletsOf = (parentId: string) =>
    usable
      .filter((i) => i.type === "bullet" && i.parentId === parentId && i.content)
      .map((b) => ownWords(b.content, [b.id]));
  const employers = new Set(
    items.filter((i) => i.type === "role" && i.organization).map((i) => norm(i.organization)),
  );
  const entry = (item: BuildableItem) => ({
    id: newId("e"),
    itemId: item.id,
    title: item.title,
    subtitle: item.organization,
    dates: dates(item),
    lines: item.type === "certification" ? [] : bulletsOf(item.id),
  });
  const ofKey: Record<Exclude<SectionKey, "skills">, (i: BuildableItem) => boolean> = {
    experience: (i) => i.type === "role",
    workProjects: (i) => i.type === "project" && isWorkProject(i, employers),
    personalProjects: (i) => i.type === "project" && !isWorkProject(i, employers),
    education: (i) => i.type === "certification",
  };
  const sections: ResumeBody["sections"] = [];
  let skillsAt: number | undefined;
  for (const key of layout.order) {
    if (key === "skills") {
      skillsAt = sections.length;
      continue;
    }
    const entries = usable.filter(ofKey[key]).map(entry);
    if (entries.length > 0) sections.push({ id: newId("s"), heading: sectionLabels[key], entries });
  }
  const skills = usable.filter((i) => i.type === "skill" && i.title);
  return resumeBodySchema.parse({
    kind: "resume",
    name: header.name,
    contact: header.contact,
    links: header.links,
    summary: [],
    sections,
    skills: skills.length
      ? [
          ownWords(
            skills.map((s) => s.title).join(", "),
            skills.map((s) => s.id),
          ),
        ]
      : [],
    // After the last section is the renderer's default, so it is left unset there.
    ...(skillsAt !== undefined && skillsAt < sections.length ? { skillsAt } : {}),
  });
}

/** The profile items a standing resume currently shows, for prefilling the builder. */
export function pickedItems(body: ResumeBody): Set<string> {
  const ids = new Set<string>();
  for (const section of body.sections) {
    for (const entry of section.entries) {
      if (entry.itemId) ids.add(entry.itemId);
      for (const line of entry.lines) for (const s of line.sources) ids.add(s);
    }
  }
  for (const line of body.skills) for (const s of line.sources) ids.add(s);
  return ids;
}
