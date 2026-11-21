import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  type Feedback,
  feedback,
  type LearnedPreference,
  learnedPreferences,
  members,
} from "@/db/schema";

export type { Feedback, LearnedPreference };

export const feedbackReasons = {
  pay: "Pay",
  wrong_role: "Wrong role",
  too_senior: "Too senior",
  location: "Location",
  company: "Company",
  other: "Other",
} as const;
export type FeedbackReason = keyof typeof feedbackReasons;

export type GradeInput = {
  jobId: string;
  targetId: string | null;
  kind: "up" | "down" | "dismissed" | "saved" | "applied";
  reason?: FeedbackReason | null;
  comment?: string;
};

/**
 * Records a member's signal about a job. A new grade replaces an earlier grade for
 * the same job (a member can change their mind); actions are kept as they happen.
 */
export async function recordFeedback(userId: string, input: GradeInput): Promise<void> {
  const isGrade = input.kind === "up" || input.kind === "down";
  await db().transaction(async (tx) => {
    if (isGrade) {
      await tx
        .delete(feedback)
        .where(
          and(
            eq(feedback.userId, userId),
            eq(feedback.jobId, input.jobId),
            sql`${feedback.kind} in ('up', 'down')`,
          ),
        );
    }
    await tx.insert(feedback).values({
      userId,
      jobId: input.jobId,
      targetId: input.targetId,
      kind: input.kind,
      reason: input.kind === "down" ? (input.reason ?? "other") : null,
      comment: (input.comment ?? "").trim().slice(0, 500),
    });
  });
}

/** The member's current grade per job, for showing thumbs on the feed. */
export async function gradesByJob(userId: string): Promise<Map<string, Feedback>> {
  const rows = await db()
    .select()
    .from(feedback)
    .where(and(eq(feedback.userId, userId), sql`${feedback.kind} in ('up', 'down')`));
  return new Map(rows.map((r) => [r.jobId, r]));
}

export async function recentFeedback(userId: string, limit = 30): Promise<Feedback[]> {
  return db()
    .select()
    .from(feedback)
    .where(eq(feedback.userId, userId))
    .orderBy(desc(feedback.createdAt))
    .limit(limit);
}

/** Feedback since preferences were last learned, to decide whether to learn again. */
export async function feedbackSince(userId: string, since: Date | null): Promise<number> {
  const [row] = await db()
    .select({ n: count() })
    .from(feedback)
    .where(and(eq(feedback.userId, userId), since ? gte(feedback.createdAt, since) : undefined));
  return row?.n ?? 0;
}

// --- Learned preferences -----------------------------------------------------

export async function listPreferences(userId: string): Promise<LearnedPreference[]> {
  return db()
    .select()
    .from(learnedPreferences)
    .where(eq(learnedPreferences.userId, userId))
    .orderBy(asc(learnedPreferences.createdAt));
}

export async function activePreferenceStatements(userId: string): Promise<string[]> {
  return (await listPreferences(userId)).filter((p) => p.active).map((p) => p.statement);
}

async function markPreferencesChanged(userId: string) {
  await db()
    .update(members)
    .set({ preferencesChangedAt: sql`now()` })
    .where(eq(members.userId, userId));
}

export type PreferenceResult = { ok: true } | { ok: false; reason: "invalid" | "not_found" };

export async function addPreference(userId: string, statement: string): Promise<PreferenceResult> {
  const value = statement.trim();
  if (value.length < 3 || value.length > 200) return { ok: false, reason: "invalid" };
  await db().insert(learnedPreferences).values({ userId, statement: value, origin: "member" });
  await markPreferencesChanged(userId);
  return { ok: true };
}

export async function updatePreference(
  userId: string,
  id: string,
  change: { statement?: string; active?: boolean },
): Promise<PreferenceResult> {
  const statement = change.statement?.trim();
  if (statement !== undefined && (statement.length < 3 || statement.length > 200)) {
    return { ok: false, reason: "invalid" };
  }
  const updated = await db()
    .update(learnedPreferences)
    // Editing a learned statement makes it the member's own, so learning keeps it as written.
    .set({ ...change, ...(statement ? { statement, origin: "member" as const } : {}) })
    .where(and(eq(learnedPreferences.id, id), eq(learnedPreferences.userId, userId)))
    .returning({ id: learnedPreferences.id });
  if (updated.length === 0) return { ok: false, reason: "not_found" };
  await markPreferencesChanged(userId);
  return { ok: true };
}

export async function deletePreference(userId: string, id: string): Promise<PreferenceResult> {
  const deleted = await db()
    .delete(learnedPreferences)
    .where(and(eq(learnedPreferences.id, id), eq(learnedPreferences.userId, userId)))
    .returning({ id: learnedPreferences.id });
  if (deleted.length === 0) return { ok: false, reason: "not_found" };
  await markPreferencesChanged(userId);
  return { ok: true };
}

/**
 * Replaces the learned (not member-written) statements with a new set. Statements the
 * member wrote or edited are never touched.
 */
export async function replaceLearnedStatements(
  userId: string,
  statements: string[],
): Promise<void> {
  const current = await listPreferences(userId);
  const memberWritten = new Set(
    current.filter((p) => p.origin === "member").map((p) => p.statement.toLowerCase()),
  );
  const fresh = [...new Set(statements.map((s) => s.trim()))].filter(
    (s) => s && !memberWritten.has(s.toLowerCase()),
  );
  const before = current
    .filter((p) => p.origin === "feedback")
    .map((p) => p.statement.toLowerCase())
    .sort()
    .join("|");
  const changed =
    before !==
    fresh
      .map((s) => s.toLowerCase())
      .sort()
      .join("|");
  await db().transaction(async (tx) => {
    await tx
      .delete(learnedPreferences)
      .where(and(eq(learnedPreferences.userId, userId), eq(learnedPreferences.origin, "feedback")));
    if (fresh.length > 0) {
      await tx
        .insert(learnedPreferences)
        .values(fresh.map((statement) => ({ userId, statement, origin: "feedback" as const })));
    }
    await tx
      .update(members)
      .set({
        preferencesLearnedAt: sql`now()`,
        // Target fit is only stale if what was learned actually changed.
        ...(changed ? { preferencesChangedAt: sql`now()` } : {}),
      })
      .where(eq(members.userId, userId));
  });
}

// --- Target change prompts -----------------------------------------------------

export type TargetPrompt = { targetId: string; reason: "pay" | "location"; count: number };

/**
 * Repeated thumbs down for pay or location on one target within 30 days suggests that
 * limit should be firm. Returned for the feed to offer; nothing changes on its own.
 */
export async function targetChangePrompts(
  userId: string,
  now: Date = new Date(),
): Promise<TargetPrompt[]> {
  const rows = await db()
    .select({ targetId: feedback.targetId, reason: feedback.reason, n: count() })
    .from(feedback)
    .where(
      and(
        eq(feedback.userId, userId),
        eq(feedback.kind, "down"),
        sql`${feedback.reason} in ('pay', 'location')`,
        gte(feedback.createdAt, new Date(now.getTime() - 30 * 86_400_000)),
      ),
    )
    .groupBy(feedback.targetId, feedback.reason);
  return rows.flatMap((r) =>
    r.targetId && (r.reason === "pay" || r.reason === "location") && r.n >= 3
      ? [{ targetId: r.targetId, reason: r.reason, count: r.n }]
      : [],
  );
}
