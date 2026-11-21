import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { type MatchSummary, matchSummaries } from "@/db/schema";
import { getSettings } from "@/features/admin/settings";
import { runTask } from "@/features/ai/run-task";
import { summarizeMatch } from "@/features/ai/tasks/summarize-match";
import { version as summaryPromptVersion } from "@/features/ai/tasks/summarize-match/prompt-v1";
import { memberTaste } from "@/features/feedback/taste";
import { jobForPrompt } from "@/features/jobs/jobs";
import { listMembers } from "@/features/members/members";
import { profileForScoring } from "@/features/profile/for-scoring";
import { targetForPrompt } from "@/features/targets/for-scoring";
import { getTarget } from "@/features/targets/targets";
import { log } from "@/lib/log";
import { feedForUser } from "./feed";

export type { MatchSummary };

export const summaryReasons = {
  useful: "Useful",
  too_generic: "Too generic",
  wrong: "Got something wrong",
  missed_something: "Missed what matters to me",
  too_long: "Too long",
} as const;
export type SummaryReason = keyof typeof summaryReasons;

/** The score a match needs for a summary: the member's choice, but never below the admin's. */
export function summaryThreshold(memberScore: number, adminMinimum: number): number {
  return Math.max(memberScore, adminMinimum);
}

/** At most this many new summaries per member per run, so one big run can't spend too much. */
const perMemberLimit = 20;

export async function summariesFor(
  userId: string,
  jobIds: string[],
): Promise<Map<string, MatchSummary>> {
  if (jobIds.length === 0) return new Map();
  const rows = await db()
    .select()
    .from(matchSummaries)
    .where(and(eq(matchSummaries.userId, userId), inArray(matchSummaries.jobId, jobIds)));
  return new Map(rows.map((r) => [r.jobId, r]));
}

/** Lines like `Not helpful (too generic): "…"` so the model learns what this member values. */
export async function summaryRatingLines(userId: string, limit: number): Promise<string[]> {
  const rated = await db()
    .select()
    .from(matchSummaries)
    .where(and(eq(matchSummaries.userId, userId), isNotNull(matchSummaries.rating)))
    .orderBy(desc(matchSummaries.ratedAt))
    .limit(limit);
  return rated.map((s) => {
    const verdict = s.rating === "up" ? "Helpful" : "Not helpful";
    const reason = s.ratingReason ? ` (${summaryReasons[s.ratingReason].toLowerCase()})` : "";
    const comment = s.ratingComment ? ` They said: "${s.ratingComment}"` : "";
    const points = s.points.map((p) => `${p.kind}: ${p.text}`).join("; ");
    return `${verdict}${reason}: "${s.headline}" [${points}]${comment}`;
  });
}

/**
 * Writes summaries for members' strong matches that have none yet, strongest first.
 * Runs after scoring (the daily run and rescores); each summary is one model call.
 */
export async function summarizeStrongMatches(
  options: { userId?: string } = {},
): Promise<{ written: number; failed: number }> {
  const settings = await getSettings();
  const members = (await listMembers()).filter(
    (m): m is typeof m & { userId: string } =>
      m.userId !== null &&
      m.state === "active" &&
      m.summariesOn &&
      (!options.userId || m.userId === options.userId),
  );
  let written = 0;
  let failed = 0;
  for (const member of members) {
    const userId = member.userId;
    const threshold = summaryThreshold(member.summaryScore, settings.summaryMinScore);
    const feed = (await feedForUser(userId, member.targetFitWeight)).filter(
      (item) => (item.best.combined ?? -1) >= threshold,
    );
    const existing = await summariesFor(
      userId,
      feed.map((i) => i.job.id),
    );
    const pending = feed
      .filter((i) => !existing.has(i.job.id))
      .sort((a, b) => (b.best.combined ?? 0) - (a.best.combined ?? 0))
      .slice(0, perMemberLimit);
    if (pending.length === 0) continue;
    const [profile, taste, pastRatings] = await Promise.all([
      profileForScoring(userId),
      memberTaste(userId),
      summaryRatingLines(userId, 10),
    ]);
    for (const item of pending) {
      const target = await getTarget(userId, item.best.targetId);
      if (!target) continue;
      const result = await runTask(userId, summarizeMatch, {
        job: jobForPrompt(item.job, 5000),
        target: targetForPrompt(target, taste.preferences),
        profile,
        pastRatings,
      });
      if (!result.ok) {
        failed++;
        // Out of allowance: stop for this member rather than fail every remaining job.
        if (result.reason === "cap_reached") break;
        continue;
      }
      await db()
        .insert(matchSummaries)
        .values({
          userId,
          jobId: item.job.id,
          ...result.output,
          promptVersion: summaryPromptVersion,
        })
        .onConflictDoNothing();
      written++;
    }
  }
  if (written || failed) log.info({ written, failed }, "match summaries");
  return { written, failed };
}

export const ratingSchema = z.object({
  rating: z.enum(["up", "down"]),
  reason: z.enum(["useful", "too_generic", "wrong", "missed_something", "too_long"]).nullable(),
  comment: z.string().trim().max(500).default(""),
});

export async function rateSummary(
  userId: string,
  id: string,
  raw: unknown,
): Promise<{ ok: boolean }> {
  const parsed = ratingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const updated = await db()
    .update(matchSummaries)
    .set({
      rating: parsed.data.rating,
      ratingReason: parsed.data.reason,
      ratingComment: parsed.data.comment,
      ratedAt: new Date(),
    })
    .where(and(eq(matchSummaries.id, id), eq(matchSummaries.userId, userId)))
    .returning({ id: matchSummaries.id });
  return { ok: updated.length > 0 };
}
