import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { type Document, documents } from "@/db/schema";
import { memberHeader } from "@/features/members/members";
import { listItems, type ProfileItem } from "@/features/profile/profile";
import { type Line, newId, type ResumeBody, resumeBodySchema } from "./body";

const dates = (item: ProfileItem) => [item.startDate, item.endDate].filter(Boolean).join(" – ");

/** Items a standing resume may show: everything except items kept off resumes. */
export function resumeItems(items: ProfileItem[]): ProfileItem[] {
  return items.filter((i) => i.visibility !== "never" && i.visibility !== "cover_letter_only");
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
  items: ProfileItem[],
  picked: Set<string>,
  header: { name: string; contact: string },
): ResumeBody {
  const usable = resumeItems(items).filter((i) => picked.has(i.id));
  const bulletsOf = (parentId: string) =>
    usable
      .filter((i) => i.type === "bullet" && i.parentId === parentId && i.content)
      .map((b) => ownWords(b.content, [b.id]));
  const entriesOf = (type: ProfileItem["type"]) =>
    usable
      .filter((i) => i.type === type)
      .map((item) => ({
        id: newId("e"),
        itemId: item.id,
        title: item.title,
        subtitle: item.organization,
        dates: dates(item),
        lines: type === "certification" ? [] : bulletsOf(item.id),
      }));
  const sections = [
    { heading: "Experience", entries: entriesOf("role") },
    { heading: "Projects", entries: entriesOf("project") },
    { heading: "Education and certifications", entries: entriesOf("certification") },
  ]
    .filter((s) => s.entries.length > 0)
    .map((s) => ({ id: newId("s"), ...s }));
  const skills = usable.filter((i) => i.type === "skill" && i.title);
  return resumeBodySchema.parse({
    kind: "resume",
    name: header.name,
    contact: header.contact,
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

export async function listStandingResumes(userId: string): Promise<Document[]> {
  return db()
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.standing, true)))
    .orderBy(asc(documents.name));
}

export async function getStandingResume(userId: string, id: string): Promise<Document | undefined> {
  const [doc] = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId), eq(documents.standing, true)));
  return doc;
}

const nameSchema = z.string().trim().min(1).max(100);

export type StandingResult =
  | { ok: true; id: string }
  | { ok: false; reason: "invalid_name" | "nothing_picked" | "not_found" };

async function bodyFor(userId: string, itemIds: string[]): Promise<ResumeBody | null> {
  const [items, member] = await Promise.all([listItems(userId), memberHeader(userId)]);
  const body = buildStandingBody(items, new Set(itemIds), {
    name: member.name,
    contact: member.email,
  });
  return body.sections.length === 0 && body.skills.length === 0 ? null : body;
}

/** Saves a standing resume. Standing resumes count as approved (SPEC "Approval"). */
export async function saveStandingResume(
  userId: string,
  id: string | null,
  rawName: string,
  itemIds: string[],
): Promise<StandingResult> {
  const name = nameSchema.safeParse(rawName);
  if (!name.success) return { ok: false, reason: "invalid_name" };
  const body = await bodyFor(userId, itemIds);
  if (!body) return { ok: false, reason: "nothing_picked" };
  if (id) {
    const updated = await db()
      .update(documents)
      .set({
        name: name.data,
        body,
        version: sql`${documents.version} + 1`,
        updatedAt: sql`now()`,
        approvedAt: sql`now()`,
      })
      .where(and(eq(documents.id, id), eq(documents.userId, userId), eq(documents.standing, true)))
      .returning({ id: documents.id });
    return updated[0] ? { ok: true, id } : { ok: false, reason: "not_found" };
  }
  const [created] = await db()
    .insert(documents)
    .values({
      userId,
      kind: "resume",
      standing: true,
      name: name.data,
      body,
      state: "approved",
      approvedAt: new Date(),
    })
    .returning({ id: documents.id });
  if (!created) throw new Error("standing resume insert returned no row");
  return { ok: true, id: created.id };
}

export async function deleteStandingResume(userId: string, id: string): Promise<boolean> {
  const deleted = await db()
    .delete(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId), eq(documents.standing, true)))
    .returning({ id: documents.id });
  return deleted.length > 0;
}
