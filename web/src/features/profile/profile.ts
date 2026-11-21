import { and, asc, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { type ProfileItem, profileItems, type ResumeUpload, resumeUploads } from "@/db/schema";
import { markProfileChanged } from "@/features/members/members";

export type { ProfileItem, ResumeUpload };

export const itemTypes = [
  "role",
  "bullet",
  "project",
  "skill",
  "certification",
  "story",
  "note",
  "summary",
] as const;
export type ItemType = (typeof itemTypes)[number];
export const parentTypes: ItemType[] = ["role", "project"];

export const itemInputSchema = z.object({
  type: z.enum(itemTypes),
  parentId: z.uuid().nullable().default(null),
  title: z.string().trim().max(300).default(""),
  organization: z.string().trim().max(300).default(""),
  content: z.string().trim().max(10_000).default(""),
  shortContent: z.string().trim().max(2000).default(""),
  alternateTitles: z.array(z.string().trim().min(1).max(300)).max(5).default([]),
  url: z
    .string()
    .trim()
    .max(300)
    .default("")
    // "mysite.com" is stored as a full address so the printed link works.
    .transform((u) => (u === "" || /^https?:\/\//i.test(u) ? u : `https://${u}`))
    .pipe(z.union([z.literal(""), z.url({ protocol: /^https?$/ })])),
  startDate: z.string().trim().max(50).default(""),
  endDate: z.string().trim().max(50).default(""),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  visibility: z.enum(["auto", "always", "never", "cover_letter_only"]).default("auto"),
});
export type ItemInput = z.input<typeof itemInputSchema>;

export type ItemResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "invalid" | "bad_parent" };

export async function listItems(userId: string): Promise<ProfileItem[]> {
  return db()
    .select()
    .from(profileItems)
    .where(eq(profileItems.userId, userId))
    .orderBy(asc(profileItems.position), asc(profileItems.createdAt));
}

async function parentIsValid(userId: string, parentId: string): Promise<boolean> {
  const [parent] = await db()
    .select({ type: profileItems.type })
    .from(profileItems)
    .where(and(eq(profileItems.id, parentId), eq(profileItems.userId, userId)));
  return parent !== undefined && parentTypes.includes(parent.type);
}

async function nextPosition(userId: string, parentId: string | null): Promise<number> {
  const [row] = await db()
    .select({ top: max(profileItems.position) })
    .from(profileItems)
    .where(
      and(
        eq(profileItems.userId, userId),
        parentId ? eq(profileItems.parentId, parentId) : isNull(profileItems.parentId),
      ),
    );
  return (row?.top ?? -1) + 1;
}

export async function createItem(
  userId: string,
  raw: ItemInput | Record<string, unknown>,
  source: ProfileItem["source"] = "manual",
): Promise<ItemResult> {
  const parsed = itemInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const input = parsed.data;
  const needsParent = input.type === "bullet";
  if (needsParent !== (input.parentId !== null)) return { ok: false, reason: "bad_parent" };
  if (input.parentId && !(await parentIsValid(userId, input.parentId))) {
    return { ok: false, reason: "bad_parent" };
  }
  const [created] = await db()
    .insert(profileItems)
    .values({ ...input, userId, source, position: await nextPosition(userId, input.parentId) })
    .returning({ id: profileItems.id });
  if (!created) return { ok: false, reason: "invalid" };
  await markProfileChanged(userId);
  return { ok: true, id: created.id };
}

export const itemPatchSchema = itemInputSchema
  .pick({
    title: true,
    organization: true,
    content: true,
    shortContent: true,
    alternateTitles: true,
    url: true,
    startDate: true,
    endDate: true,
    tags: true,
    visibility: true,
  })
  .partial();

export async function updateItem(
  userId: string,
  itemId: string,
  raw: z.input<typeof itemPatchSchema> | Record<string, unknown>,
): Promise<ItemResult> {
  const parsed = itemPatchSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  // Zod fills the input schema's defaults even for keys a partial schema leaves out, so
  // keep only the fields the caller sent: a one-field patch must not blank the rest.
  const patch = Object.fromEntries(Object.entries(parsed.data).filter(([key]) => key in raw));
  const updated = await db()
    .update(profileItems)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(and(eq(profileItems.id, itemId), eq(profileItems.userId, userId)))
    .returning({ id: profileItems.id });
  if (!updated[0]) return { ok: false, reason: "not_found" };
  await markProfileChanged(userId);
  return { ok: true, id: itemId };
}

/** Deletes an item and, through the parent link, its bullets. */
export async function deleteItem(userId: string, itemId: string): Promise<ItemResult> {
  const deleted = await db()
    .delete(profileItems)
    .where(and(eq(profileItems.id, itemId), eq(profileItems.userId, userId)))
    .returning({ id: profileItems.id });
  if (!deleted[0]) return { ok: false, reason: "not_found" };
  await markProfileChanged(userId);
  return { ok: true, id: itemId };
}

/** Swaps an item with its neighbour among items of the same type and parent. */
export async function moveItem(
  userId: string,
  itemId: string,
  direction: "up" | "down",
): Promise<ItemResult> {
  return db().transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(profileItems)
      .where(and(eq(profileItems.id, itemId), eq(profileItems.userId, userId)));
    if (!item) return { ok: false, reason: "not_found" };
    const siblings = await tx
      .select()
      .from(profileItems)
      .where(
        and(
          eq(profileItems.userId, userId),
          eq(profileItems.type, item.type),
          item.parentId ? eq(profileItems.parentId, item.parentId) : isNull(profileItems.parentId),
        ),
      )
      .orderBy(asc(profileItems.position), asc(profileItems.createdAt));
    const index = siblings.findIndex((s) => s.id === itemId);
    const neighbour = siblings[direction === "up" ? index - 1 : index + 1];
    if (!neighbour) return { ok: true, id: itemId };
    // Renumber the whole group so equal positions cannot make a swap a no-op.
    const order = siblings.map((s) => s.id);
    order[index] = neighbour.id;
    order[direction === "up" ? index - 1 : index + 1] = itemId;
    for (const [position, id] of order.entries()) {
      await tx.update(profileItems).set({ position }).where(eq(profileItems.id, id));
    }
    return { ok: true, id: itemId };
  });
}

// --- Resume uploads -------------------------------------------------------

export async function createUpload(
  userId: string,
  filename: string,
  text: string,
): Promise<string> {
  const [upload] = await db()
    .insert(resumeUploads)
    .values({ userId, filename, text })
    .returning({ id: resumeUploads.id });
  if (!upload) throw new Error("resume upload insert returned no row");
  return upload.id;
}

export async function getUpload(userId: string, uploadId: string) {
  const [upload] = await db()
    .select()
    .from(resumeUploads)
    .where(and(eq(resumeUploads.id, uploadId), eq(resumeUploads.userId, userId)));
  return upload;
}

export async function latestUpload(userId: string): Promise<ResumeUpload | undefined> {
  const [upload] = await db()
    .select()
    .from(resumeUploads)
    .where(eq(resumeUploads.userId, userId))
    .orderBy(desc(resumeUploads.createdAt))
    .limit(1);
  return upload;
}

export async function markUploadFailed(userId: string, uploadId: string, failure: string) {
  await db()
    .update(resumeUploads)
    .set({ state: "failed", failure })
    .where(and(eq(resumeUploads.id, uploadId), eq(resumeUploads.userId, userId)));
}

type ParsedItem = {
  type: Exclude<ItemType, "bullet">;
  title: string;
  organization: string;
  content: string;
  startDate: string;
  endDate: string;
  bullets: string[];
};

/** Saves parsed items after any existing ones, all marked as coming from the upload. */
export async function saveParsedItems(
  userId: string,
  uploadId: string,
  items: ParsedItem[],
): Promise<number> {
  return db()
    .transaction(async (tx) => {
      const [row] = await tx
        .select({ top: max(profileItems.position) })
        .from(profileItems)
        .where(and(eq(profileItems.userId, userId), isNull(profileItems.parentId)));
      let position = (row?.top ?? -1) + 1;
      let created = 0;
      for (const item of items) {
        const { bullets, ...fields } = item;
        const [parent] = await tx
          .insert(profileItems)
          .values({ ...fields, userId, source: "upload", position: position++ })
          .returning({ id: profileItems.id });
        created++;
        const kept = parentTypes.includes(item.type) ? bullets.filter((b) => b.trim()) : [];
        if (parent && kept.length > 0) {
          await tx.insert(profileItems).values(
            kept.map((content, i) => ({
              userId,
              type: "bullet" as const,
              parentId: parent.id,
              content: content.trim(),
              source: "upload" as const,
              position: i,
            })),
          );
          created += kept.length;
        }
      }
      await tx
        .update(resumeUploads)
        .set({ state: "done", itemsCreated: created })
        .where(and(eq(resumeUploads.id, uploadId), eq(resumeUploads.userId, userId)));
      return created;
    })
    .then(async (created) => {
      await markProfileChanged(userId);
      return created;
    });
}

/** Deletes the given items if they belong to the user. Used by tests and future bulk edits. */
export async function deleteItems(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db()
    .delete(profileItems)
    .where(and(eq(profileItems.userId, userId), inArray(profileItems.id, ids)));
  await markProfileChanged(userId);
}

/** Role titles and skills only: enough for other features to tailor a search, nothing more. */
export async function profileHeadlines(
  userId: string,
): Promise<{ roleTitles: string[]; skills: string[] }> {
  const rows = await db()
    .select({ type: profileItems.type, title: profileItems.title })
    .from(profileItems)
    .where(and(eq(profileItems.userId, userId), inArray(profileItems.type, ["role", "skill"])))
    .orderBy(asc(profileItems.position));
  return {
    roleTitles: rows.filter((r) => r.type === "role" && r.title).map((r) => r.title),
    skills: rows.filter((r) => r.type === "skill" && r.title).map((r) => r.title),
  };
}
