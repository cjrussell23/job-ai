import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { type Document, documents } from "@/db/schema";
import { documentHeader } from "@/features/profile/contact";
import { listItems } from "@/features/profile/profile";
import type { ResumeBody } from "./body";
import { type Layout, layoutSchema } from "./layout";
import { buildStandingBody } from "./standing-body";

export { buildStandingBody, pickedItems, resumeItems } from "./standing-body";

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
  | { ok: false; reason: "invalid_name" | "invalid_layout" | "nothing_picked" | "not_found" };

async function bodyFor(
  userId: string,
  itemIds: string[],
  layout: Layout,
): Promise<ResumeBody | null> {
  const [items, header] = await Promise.all([listItems(userId), documentHeader(userId)]);
  const body = buildStandingBody(items, new Set(itemIds), header, layout);
  return body.sections.length === 0 && body.skills.length === 0 ? null : body;
}

/** Saves a standing resume. Standing resumes count as approved (SPEC "Approval"). */
export async function saveStandingResume(
  userId: string,
  id: string | null,
  rawName: string,
  itemIds: string[],
  rawLayout: unknown = {},
): Promise<StandingResult> {
  const name = nameSchema.safeParse(rawName);
  if (!name.success) return { ok: false, reason: "invalid_name" };
  const layout = layoutSchema.safeParse(rawLayout);
  if (!layout.success) return { ok: false, reason: "invalid_layout" };
  const body = await bodyFor(userId, itemIds, layout.data);
  if (!body) return { ok: false, reason: "nothing_picked" };
  if (id) {
    const updated = await db()
      .update(documents)
      .set({
        name: name.data,
        body,
        layout: layout.data,
        // Saving by hand also settles a resume whose automatic pick failed.
        state: "approved",
        failure: null,
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
      layout: layout.data,
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

/** A copy of a standing resume under a new name, to start a variant from. */
export async function duplicateStandingResume(userId: string, id: string): Promise<StandingResult> {
  const original = await getStandingResume(userId, id);
  if (!original?.body) return { ok: false, reason: "not_found" };
  const [created] = await db()
    .insert(documents)
    .values({
      userId,
      kind: "resume",
      standing: true,
      name: `Copy of ${original.name}`.slice(0, 100),
      body: original.body,
      layout: original.layout,
      state: "approved",
      approvedAt: new Date(),
    })
    .returning({ id: documents.id });
  if (!created) throw new Error("standing resume copy returned no row");
  return { ok: true, id: created.id };
}

/** Renders the picked items to a real PDF and counts its pages, for an exact answer. */
export async function exactPageCount(
  userId: string,
  itemIds: string[],
  rawLayout: unknown,
): Promise<number | null> {
  const layout = layoutSchema.safeParse(rawLayout);
  if (!layout.success) return null;
  const body = await bodyFor(userId, itemIds, layout.data);
  if (!body) return null;
  const { htmlToPdf, pdfPageCount } = await import("./pdf");
  const { renderResume } = await import("./render");
  return pdfPageCount(await htmlToPdf(renderResume(body, { layout: layout.data })));
}
