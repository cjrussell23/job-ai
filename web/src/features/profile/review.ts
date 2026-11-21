import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { type ProfileReview, profileQuestions, profileReviews, suggestions } from "@/db/schema";
import { runTask } from "@/features/ai/run-task";
import { type ReviewOutput, reviewProfile } from "@/features/ai/tasks/review-profile";
import { jobForPrompt, jobsWithPostings } from "@/features/jobs/jobs";
import { getMemberByUserId } from "@/features/members/members";
import { feedForUser } from "@/features/scoring/feed";
import { log } from "@/lib/log";
import { listItems, type ProfileItem } from "./profile";
import { askedTopics } from "./questions";
import { itemsWithOpenSuggestions } from "./suggestions";

export type { ProfileReview };

/** How many of the member's best matches are shown to the model to spot recurring requirements. */
const matchedJobsForReview = 15;
// A review stuck "running" this long has died with the worker; another may start.
const staleAfterMinutes = 15;

const failures = {
  cap_reached: "Your monthly AI allowance is used up, so reviews are paused until next month.",
  invalid_output: "The review could not be completed reliably. Try again.",
  model_error: "The AI service did not respond. Try again in a few minutes.",
} as const;

export async function latestReview(
  userId: string,
  jobId: string | null,
): Promise<ProfileReview | undefined> {
  const [row] = await db()
    .select()
    .from(profileReviews)
    .where(
      and(
        eq(profileReviews.userId, userId),
        jobId ? eq(profileReviews.jobId, jobId) : sql`${profileReviews.jobId} is null`,
      ),
    )
    .orderBy(desc(profileReviews.createdAt))
    .limit(1);
  return row;
}

export type StartResult = { ok: true; reviewId: string } | { ok: false; reason: "busy" };

/** Records a review request; the caller enqueues it. One review runs at a time per member. */
export async function startReview(userId: string, jobId: string | null): Promise<StartResult> {
  const [running] = await db()
    .select({ id: profileReviews.id })
    .from(profileReviews)
    .where(
      and(
        eq(profileReviews.userId, userId),
        eq(profileReviews.state, "running"),
        gt(profileReviews.createdAt, sql`now() - make_interval(mins => ${staleAfterMinutes})`),
      ),
    );
  if (running) return { ok: false, reason: "busy" };
  const [created] = await db()
    .insert(profileReviews)
    .values({ userId, jobId })
    .returning({ id: profileReviews.id });
  if (!created) throw new Error("review insert returned no row");
  return { ok: true, reviewId: created.id };
}

async function finish(userId: string, reviewId: string, failure: string | null) {
  await db()
    .update(profileReviews)
    .set({ state: failure ? "failed" : "done", failure })
    .where(and(eq(profileReviews.id, reviewId), eq(profileReviews.userId, userId)));
}

function itemsForReview(items: ProfileItem[]): string {
  return items
    .filter((i) => i.visibility !== "never")
    .map((i) =>
      JSON.stringify({
        id: i.id,
        type: i.type,
        ...(i.parentId ? { parentId: i.parentId } : {}),
        ...(i.title ? { title: i.title } : {}),
        ...(i.organization ? { organization: i.organization } : {}),
        ...(i.content ? { content: i.content } : {}),
      }),
    )
    .join("\n");
}

/** Worker job: one model call that proposes suggestions and questions, then stores the valid ones. */
export async function runReview(userId: string, reviewId: string): Promise<void> {
  const [review] = await db()
    .select()
    .from(profileReviews)
    .where(and(eq(profileReviews.id, reviewId), eq(profileReviews.userId, userId)));
  if (!review) return;
  const items = await listItems(userId);
  const profile = itemsForReview(items);
  if (profile === "")
    return finish(userId, reviewId, "Your profile is empty. Add some items first.");

  let job: string | null = null;
  let matchedJobs = "";
  let matchedIds = new Set<string>();
  if (review.jobId) {
    const [found] = await jobsWithPostings([review.jobId]);
    if (!found) return finish(userId, reviewId, "That job is no longer available.");
    job = jobForPrompt(found);
  } else {
    const member = await getMemberByUserId(userId);
    const feed = (await feedForUser(userId, member?.targetFitWeight ?? 60)).slice(
      0,
      matchedJobsForReview,
    );
    matchedIds = new Set(feed.map((f) => f.job.id));
    matchedJobs = feed
      .map((f) => `id: ${f.job.id}\n${jobForPrompt(f.job, 1500)}`)
      .join("\n\n---\n\n");
  }

  const result = await runTask(userId, reviewProfile, {
    profile,
    job,
    matchedJobs,
    alreadyAsked: await askedTopics(userId),
  });
  if (!result.ok) return finish(userId, reviewId, failures[result.reason]);
  const saved = await saveReview(userId, review.jobId, result.output, items, matchedIds);
  log.info({ reviewId, ...saved }, "profile review saved");
  return finish(userId, reviewId, null);
}

/**
 * Keeps only output that points at the member's own items and real matched jobs.
 * Exported for tests; the model's output is never trusted to reference valid ids.
 */
export async function saveReview(
  userId: string,
  jobId: string | null,
  output: ReviewOutput,
  items: ProfileItem[],
  matchedIds: Set<string>,
): Promise<{ suggestions: number; questions: number }> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const busyItems = await itemsWithOpenSuggestions(userId);
  const newSuggestions = [];
  for (const s of output.suggestions) {
    const item = byId.get(s.itemId);
    if (!item?.content || item.visibility === "never") continue;
    if (s.proposed === item.content || busyItems.has(item.id)) continue;
    if (s.kind === "job_wording" && !jobId) continue;
    busyItems.add(item.id);
    newSuggestions.push({
      userId,
      profileItemId: item.id,
      jobId: s.kind === "job_wording" ? jobId : null,
      kind: s.kind,
      originalText: item.content,
      proposedText: s.proposed,
      reason: s.reason,
    });
  }

  const asked = new Set((await askedTopics(userId)).map((t) => t.toLowerCase()));
  const newQuestions = [];
  for (const q of output.questions) {
    const key = q.topic.toLowerCase();
    if (asked.has(key)) continue;
    const jobIds = [...new Set(q.jobIds)].filter((id) => matchedIds.has(id));
    // "Recurring" means it shows up in more than one real match.
    if (q.trigger === "recurring_requirement" && jobIds.length < 2) continue;
    if (q.trigger === "job" && !jobId) continue;
    const item = q.itemId ? byId.get(q.itemId) : undefined;
    if (q.trigger === "thin_item" && !item) continue;
    asked.add(key);
    newQuestions.push({
      userId,
      topic: q.topic,
      question: q.question,
      trigger: q.trigger,
      profileItemId: item?.id ?? null,
      jobId: q.trigger === "job" ? jobId : null,
      jobCount: jobIds.length,
    });
  }

  if (newSuggestions.length) await db().insert(suggestions).values(newSuggestions);
  if (newQuestions.length) await db().insert(profileQuestions).values(newQuestions);
  return { suggestions: newSuggestions.length, questions: newQuestions.length };
}
