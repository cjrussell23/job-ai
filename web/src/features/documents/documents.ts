import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { type Document, documents } from "@/db/schema";
import { allLines, type DocumentBody, documentBodySchema, type Line, newId } from "./body";

export type { Document };
export type DocumentKind = "resume" | "cover_letter";

/** The member's tailored documents for one job. */
export async function documentsForJob(userId: string, jobId: string): Promise<Document[]> {
  return db()
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.jobId, jobId)))
    .orderBy(desc(documents.updatedAt));
}

export async function getDocument(
  userId: string,
  documentId: string,
): Promise<Document | undefined> {
  const [doc] = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
  return doc;
}

/** The member's documents among the given ids, for showing what each application used. */
export async function documentsByIds(
  userId: string,
  ids: string[],
): Promise<Map<string, Document>> {
  if (ids.length === 0) return new Map();
  const rows = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), inArray(documents.id, ids)));
  return new Map(rows.map((d) => [d.id, d]));
}

/** Approved documents for a job, which are the only ones an application may use (rule 6). */
export async function approvedDocumentsForJob(userId: string, jobId: string): Promise<Document[]> {
  return (await documentsForJob(userId, jobId)).filter((d) => d.state === "approved");
}

/**
 * Marks a tailored document as being written, creating it or bumping its version.
 * There is one tailored document of each kind per member and job.
 */
export async function startDocument(
  userId: string,
  jobId: string,
  kind: DocumentKind,
): Promise<string> {
  const [existing] = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.jobId, jobId), eq(documents.kind, kind)));
  if (existing) {
    await db()
      .update(documents)
      .set({
        state: "generating",
        failure: null,
        version: existing.version + 1,
        approvedAt: null,
        updatedAt: sql`now()`,
      })
      .where(eq(documents.id, existing.id));
    return existing.id;
  }
  const [created] = await db()
    .insert(documents)
    .values({ userId, jobId, kind, state: "generating" })
    .returning({ id: documents.id });
  if (!created) throw new Error("document insert returned no row");
  return created.id;
}

export async function finishDocument(
  userId: string,
  documentId: string,
  body: DocumentBody,
): Promise<void> {
  await db()
    .update(documents)
    .set({ body: documentBodySchema.parse(body), state: "draft", updatedAt: sql`now()` })
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
}

export async function failDocument(
  userId: string,
  documentId: string,
  failure: string,
): Promise<void> {
  await db()
    .update(documents)
    .set({ state: "failed", failure, updatedAt: sql`now()` })
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
}

export type EditResult = { ok: true } | { ok: false; reason: "not_found" | "invalid" | "busy" };

/**
 * Saves a member's edits. Sources come from the stored document, never from the
 * request: a changed sourced line becomes "edited", a new line is "user_written"
 * with no sources. Any edit returns an approved document to draft (rule 6).
 */
export function reconcileEdits(stored: DocumentBody, edited: DocumentBody): DocumentBody {
  const before = new Map(allLines(stored).map((l) => [l.id, l]));
  const fix = (line: Line): Line => {
    const original = before.get(line.id);
    if (!original) return { id: newId(), text: line.text, sources: [], origin: "user_written" };
    if (original.text === line.text) return original;
    return {
      ...original,
      text: line.text,
      origin: original.sources.length > 0 ? "edited" : "user_written",
    };
  };
  if (edited.kind === "cover_letter" && stored.kind === "cover_letter") {
    return {
      ...stored,
      greeting: edited.greeting,
      closing: edited.closing,
      paragraphs: edited.paragraphs.map(fix),
    };
  }
  if (edited.kind === "resume" && stored.kind === "resume") {
    const storedEntries = new Map(stored.sections.flatMap((s) => s.entries).map((e) => [e.id, e]));
    return {
      ...stored,
      summary: edited.summary.map(fix),
      skills: edited.skills.map(fix),
      // Entries keep their profile headings; only their lines can change, and entries can be removed.
      sections: edited.sections
        .map((section) => ({
          ...section,
          entries: section.entries.flatMap((entry) => {
            const original = storedEntries.get(entry.id);
            return original ? [{ ...original, lines: entry.lines.map(fix) }] : [];
          }),
        }))
        .filter((s) => s.entries.length > 0),
    };
  }
  return stored;
}

export async function saveEdits(
  userId: string,
  documentId: string,
  raw: unknown,
): Promise<EditResult> {
  const doc = await getDocument(userId, documentId);
  if (!doc) return { ok: false, reason: "not_found" };
  if (doc.state === "generating" || !doc.body) return { ok: false, reason: "busy" };
  const edited = documentBodySchema.safeParse(raw);
  const stored = documentBodySchema.safeParse(doc.body);
  if (!edited.success || !stored.success) return { ok: false, reason: "invalid" };
  const body = reconcileEdits(stored.data, edited.data);
  await db()
    .update(documents)
    .set({ body, state: "draft", approvedAt: null, updatedAt: sql`now()` })
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
  return { ok: true };
}

export async function approveDocument(userId: string, documentId: string): Promise<EditResult> {
  const doc = await getDocument(userId, documentId);
  if (!doc) return { ok: false, reason: "not_found" };
  if (doc.state !== "draft" || !doc.body) return { ok: false, reason: "busy" };
  await db()
    .update(documents)
    .set({ state: "approved", approvedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
  return { ok: true };
}
