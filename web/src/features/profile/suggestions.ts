import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { profileItems, type Suggestion, suggestions } from "@/db/schema";
import { updateItem } from "./profile";

export type { Suggestion };

export const suggestionKindLabels: Record<Suggestion["kind"], string> = {
  vague: "Clearer wording",
  too_long: "Shorter",
  repetition: "Less repetition",
  job_wording: "Wording for this job",
};

/**
 * Open suggestions, oldest first. One whose item was edited since is hidden:
 * it was written against text that no longer exists.
 */
export async function openSuggestions(
  userId: string,
  jobId?: string,
): Promise<(Suggestion & { itemTitle: string })[]> {
  const rows = await db()
    .select({ suggestion: suggestions, content: profileItems.content, title: profileItems.title })
    .from(suggestions)
    .innerJoin(profileItems, eq(profileItems.id, suggestions.profileItemId))
    .where(
      and(
        eq(suggestions.userId, userId),
        eq(suggestions.state, "open"),
        jobId ? eq(suggestions.jobId, jobId) : undefined,
      ),
    )
    .orderBy(asc(suggestions.createdAt));
  return rows
    .filter((r) => r.content === r.suggestion.originalText)
    .map((r) => ({ ...r.suggestion, itemTitle: r.title }));
}

export type DecideResult = { ok: true } | { ok: false; reason: "not_found" | "item_changed" };

/** Applies the proposed wording to the item (rule 3: only on the member's say-so). */
export async function acceptSuggestion(userId: string, id: string): Promise<DecideResult> {
  const [row] = await db()
    .select({ suggestion: suggestions, content: profileItems.content })
    .from(suggestions)
    .innerJoin(profileItems, eq(profileItems.id, suggestions.profileItemId))
    .where(
      and(eq(suggestions.id, id), eq(suggestions.userId, userId), eq(suggestions.state, "open")),
    );
  if (!row) return { ok: false, reason: "not_found" };
  if (row.content !== row.suggestion.originalText) return { ok: false, reason: "item_changed" };
  const updated = await updateItem(userId, row.suggestion.profileItemId, {
    content: row.suggestion.proposedText,
  });
  if (!updated.ok) return { ok: false, reason: "not_found" };
  await decide(userId, id, "accepted");
  return { ok: true };
}

export async function rejectSuggestion(userId: string, id: string): Promise<DecideResult> {
  return (await decide(userId, id, "rejected")) ? { ok: true } : { ok: false, reason: "not_found" };
}

async function decide(userId: string, id: string, state: "accepted" | "rejected") {
  const rows = await db()
    .update(suggestions)
    .set({ state, decidedAt: sql`now()` })
    .where(
      and(eq(suggestions.id, id), eq(suggestions.userId, userId), eq(suggestions.state, "open")),
    )
    .returning({ id: suggestions.id });
  return rows.length > 0;
}

/** Item ids that already have an open suggestion, so a review doesn't pile on more. */
export async function itemsWithOpenSuggestions(userId: string): Promise<Set<string>> {
  const rows = await db()
    .select({ itemId: suggestions.profileItemId })
    .from(suggestions)
    .where(and(eq(suggestions.userId, userId), eq(suggestions.state, "open")));
  return new Set(rows.map((r) => r.itemId));
}
