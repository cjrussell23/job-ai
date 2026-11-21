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
  | "shortContent"
  | "alternateTitles"
  | "url"
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

/** Items in the member's order for this resume, then profile order for the rest. */
export function inResumeOrder<T extends { id: string }>(items: T[], itemOrder: string[]): T[] {
  const rank = new Map(itemOrder.map((id, i) => [id, i]));
  return items
    .map((item, i) => ({ item, i }))
    .sort(
      (a, b) =>
        (rank.get(a.item.id) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b.item.id) ?? Number.MAX_SAFE_INTEGER) || a.i - b.i,
    )
    .map((x) => x.item);
}

/** The title a role shows: the chosen one if it is one of the role's own titles. */
export function titleFor(item: BuildableItem, layout: Layout): string {
  const chosen = layout.titles[item.id];
  return chosen && (chosen === item.title || item.alternateTitles.includes(chosen))
    ? chosen
    : item.title;
}

/** A bullet's wording: its short version when the member chose it and one exists. */
export function bulletText(item: BuildableItem, layout: Layout): string {
  return layout.short.includes(item.id) && item.shortContent ? item.shortContent : item.content;
}

/**
 * A standing resume from the items the member picked, in the member's order. Every line is
 * an item's own words, so its sources are exact (rule 1). A bullet shows only under a
 * picked role or project.
 */
export function buildStandingBody(
  items: BuildableItem[],
  picked: Set<string>,
  header: { name: string; contact: string; links: { label: string; url: string }[] },
  layout: Layout = defaultLayout,
): ResumeBody {
  const usable = inResumeOrder(
    resumeItems(items).filter((i) => picked.has(i.id)),
    layout.itemOrder,
  );
  const bulletsOf = (parentId: string) =>
    usable
      .filter((i) => i.type === "bullet" && i.parentId === parentId && i.content)
      .map((b) => ownWords(bulletText(b, layout), [b.id]));
  const employers = new Set(
    items.filter((i) => i.type === "role" && i.organization).map((i) => norm(i.organization)),
  );
  const entry = (item: BuildableItem) => ({
    id: newId("e"),
    itemId: item.id,
    title: item.type === "role" ? titleFor(item, layout) : item.title,
    subtitle: item.organization,
    dates: layout.showDates ? dates(item) : "",
    ...(item.url ? { url: item.url } : {}),
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
    if (entries.length > 0) {
      sections.push({
        id: newId("s"),
        heading: layout.headings[key] || sectionLabels[key],
        ...(key === "experience" ? { groupable: true } : {}),
        entries,
      });
    }
  }
  const skills = usable.filter((i) => i.type === "skill" && i.title);
  // The summary is chosen in the layout, not by the checkboxes.
  const summary = resumeItems(items).find(
    (i) => i.id === layout.summaryId && i.type === "summary" && i.content,
  );
  return resumeBodySchema.parse({
    kind: "resume",
    name: header.name,
    contact: header.contact,
    links: header.links,
    summary: summary ? [ownWords(summary.content, [summary.id])] : [],
    sections,
    skills: skills.length
      ? [
          ownWords(
            skills.map((s) => s.title).join(", "),
            skills.map((s) => s.id),
          ),
        ]
      : [],
    ...(layout.headings.skills ? { skillsHeading: layout.headings.skills } : {}),
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
