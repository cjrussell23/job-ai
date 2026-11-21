import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { documents } from "@/db/schema";
import { runTask } from "@/features/ai/run-task";
import { pickResumeItems } from "@/features/ai/tasks/pick-resume-items";
import { documentHeader } from "@/features/profile/contact";
import { listItems, type ProfileItem } from "@/features/profile/profile";
import { targetForPrompt } from "@/features/targets/for-scoring";
import { getTarget } from "@/features/targets/targets";
import { queue, queues } from "@/lib/queue";
import { itemsForPrompt } from "./assemble";
import { recommendedPages, yearsOfExperience } from "./guidance";
import { layoutSchema } from "./layout";
import { buildStandingBody, resumeItems } from "./standing-body";

const failures = {
  cap_reached: "Your monthly AI allowance is used up, so picking is paused until next month.",
  invalid_output: "The picks could not be made reliably. Try again, or pick by hand.",
  model_error: "The AI service did not respond. Try again in a few minutes.",
} as const;

export type StartPickResult = { ok: true; id: string } | { ok: false; reason: "not_found" };

/** Creates a standing resume and asks the worker to pick its items for one job target. */
export async function startPickForTarget(
  userId: string,
  targetId: string,
): Promise<StartPickResult> {
  const target = await getTarget(userId, targetId);
  if (!target) return { ok: false, reason: "not_found" };
  const [created] = await db()
    .insert(documents)
    .values({
      userId,
      kind: "resume",
      standing: true,
      name: `For ${target.roleType}`.slice(0, 100),
      state: "generating",
    })
    .returning({ id: documents.id });
  if (!created) throw new Error("standing resume insert returned no row");
  await (await queue()).send(queues.pickResumeItems, {
    userId,
    documentId: created.id,
    targetId,
  });
  return { ok: true, id: created.id };
}

/**
 * Pure: the model's picks, kept only where they are real, usable items. "Always include"
 * items are added, and a bullet stays only if its role or project was picked too.
 */
export function cleanPicks(
  items: ProfileItem[],
  pickedIds: string[],
  summaryId: string | null,
): { picked: Set<string>; summaryId: string | null } {
  const usable = new Map(resumeItems(items).map((i) => [i.id, i]));
  const picked = new Set(pickedIds.filter((id) => usable.has(id)));
  for (const item of usable.values()) {
    if (item.visibility === "always") picked.add(item.id);
  }
  for (const id of [...picked]) {
    const item = usable.get(id);
    if (item?.type === "bullet" && (!item.parentId || !picked.has(item.parentId)))
      picked.delete(id);
    if (item?.type === "summary") picked.delete(id);
  }
  const summary = summaryId ? usable.get(summaryId) : undefined;
  return { picked, summaryId: summary?.type === "summary" ? summary.id : null };
}

async function fail(userId: string, documentId: string, failure: string): Promise<void> {
  await db()
    .update(documents)
    .set({ state: "failed", failure, updatedAt: sql`now()` })
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
}

/** Worker job: the model chooses profile items; the resume is built from their own words. */
export async function pickForTarget(
  userId: string,
  documentId: string,
  targetId: string,
): Promise<void> {
  const [items, header, target] = await Promise.all([
    listItems(userId),
    documentHeader(userId),
    getTarget(userId, targetId),
  ]);
  if (!target) return fail(userId, documentId, "That job target no longer exists.");
  const usable = new Map(resumeItems(items).map((i) => [i.id, i]));
  if (usable.size === 0) return fail(userId, documentId, "Your profile is empty.");
  const years = yearsOfExperience(items.filter((i) => i.type === "role").map((i) => i.startDate));
  const pages = recommendedPages(years);
  const result = await runTask(userId, pickResumeItems, {
    profile: itemsForPrompt(usable),
    target: targetForPrompt(target),
    pages,
  });
  if (!result.ok) return fail(userId, documentId, failures[result.reason]);
  const { picked, summaryId } = cleanPicks(items, result.output.itemIds, result.output.summaryId);
  const layout = layoutSchema.parse({ pages, summaryId });
  const body = buildStandingBody(items, picked, header, layout);
  await db()
    .update(documents)
    .set({
      body,
      layout,
      state: "approved",
      failure: null,
      approvedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
}
