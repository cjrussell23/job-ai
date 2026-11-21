import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { type ProfileQuestion, profileItems, profileQuestions } from "@/db/schema";
import { createItem, parentTypes } from "./profile";

export type { ProfileQuestion };

// A specific job the member cares about comes first, then what recurs most in their matches.
const triggerOrder = sql`case ${profileQuestions.trigger}
  when 'job' then 0 when 'recurring_requirement' then 1 when 'thin_item' then 2 else 3 end`;

/** The one question to show next, or none. Questions are asked one at a time. */
export async function nextQuestion(
  userId: string,
  jobId?: string,
): Promise<ProfileQuestion | undefined> {
  const [row] = await db()
    .select()
    .from(profileQuestions)
    .where(
      and(
        eq(profileQuestions.userId, userId),
        eq(profileQuestions.state, "open"),
        jobId ? eq(profileQuestions.jobId, jobId) : undefined,
      ),
    )
    .orderBy(triggerOrder, desc(profileQuestions.jobCount), asc(profileQuestions.createdAt))
    .limit(1);
  return row;
}

export async function openQuestionCount(userId: string): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(profileQuestions)
    .where(and(eq(profileQuestions.userId, userId), eq(profileQuestions.state, "open")));
  return row?.n ?? 0;
}

/** Every topic ever asked, whatever the answer, so nothing is asked twice. */
export async function askedTopics(userId: string): Promise<string[]> {
  const rows = await db()
    .select({ topic: profileQuestions.topic })
    .from(profileQuestions)
    .where(eq(profileQuestions.userId, userId));
  return rows.map((r) => r.topic);
}

/** What the member said they have not done; drafting is told never to claim these (rule 2). */
export async function recordedNos(userId: string): Promise<string[]> {
  const rows = await db()
    .select({ topic: profileQuestions.topic, question: profileQuestions.question })
    .from(profileQuestions)
    .where(and(eq(profileQuestions.userId, userId), eq(profileQuestions.state, "no")))
    .orderBy(asc(profileQuestions.answeredAt));
  return rows.map((r) => `${r.topic}: answered no to "${r.question}"`);
}

/** Requirements that recur in the member's matches and that they said they don't have. */
export async function skillGaps(userId: string): Promise<ProfileQuestion[]> {
  return db()
    .select()
    .from(profileQuestions)
    .where(
      and(
        eq(profileQuestions.userId, userId),
        eq(profileQuestions.state, "no"),
        inArray(profileQuestions.trigger, ["recurring_requirement", "job"]),
      ),
    )
    .orderBy(desc(profileQuestions.jobCount), asc(profileQuestions.topic));
}

export type AnswerResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "example_needed" | "invalid" };

async function openQuestion(userId: string, id: string) {
  const [row] = await db()
    .select()
    .from(profileQuestions)
    .where(
      and(
        eq(profileQuestions.id, id),
        eq(profileQuestions.userId, userId),
        eq(profileQuestions.state, "open"),
      ),
    );
  return row;
}

const exampleSchema = z.string().trim().min(10).max(2000);

/**
 * A yes always comes with one concrete example, saved as a profile item: a bullet
 * under the role or project asked about, otherwise a story named for the topic.
 */
export async function answerYes(
  userId: string,
  id: string,
  example: string,
): Promise<AnswerResult> {
  const question = await openQuestion(userId, id);
  if (!question) return { ok: false, reason: "not_found" };
  const content = exampleSchema.safeParse(example);
  if (!content.success) return { ok: false, reason: "example_needed" };

  let parentId: string | null = null;
  if (question.profileItemId) {
    const [item] = await db()
      .select({ id: profileItems.id, type: profileItems.type, parentId: profileItems.parentId })
      .from(profileItems)
      .where(and(eq(profileItems.id, question.profileItemId), eq(profileItems.userId, userId)));
    if (item && parentTypes.includes(item.type)) parentId = item.id;
    else if (item?.type === "bullet") parentId = item.parentId;
  }
  const created = await createItem(
    userId,
    parentId
      ? { type: "bullet", parentId, content: content.data }
      : { type: "story", title: question.topic, content: content.data },
    "question",
  );
  if (!created.ok) return { ok: false, reason: "invalid" };
  await db()
    .update(profileQuestions)
    .set({ state: "yes", answerItemId: created.id, answeredAt: sql`now()` })
    .where(and(eq(profileQuestions.id, id), eq(profileQuestions.userId, userId)));
  return { ok: true };
}

export async function answerNo(userId: string, id: string): Promise<AnswerResult> {
  return close(userId, id, "no");
}

export async function skipQuestion(userId: string, id: string): Promise<AnswerResult> {
  return close(userId, id, "skipped");
}

async function close(userId: string, id: string, state: "no" | "skipped"): Promise<AnswerResult> {
  const rows = await db()
    .update(profileQuestions)
    .set({ state, answeredAt: sql`now()` })
    .where(
      and(
        eq(profileQuestions.id, id),
        eq(profileQuestions.userId, userId),
        eq(profileQuestions.state, "open"),
      ),
    )
    .returning({ id: profileQuestions.id });
  return rows.length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}

/** Lets the member take back a "no", e.g. after learning a skill gap. */
export async function reopenQuestion(userId: string, id: string): Promise<AnswerResult> {
  const rows = await db()
    .update(profileQuestions)
    .set({ state: "open", answeredAt: null })
    .where(
      and(
        eq(profileQuestions.id, id),
        eq(profileQuestions.userId, userId),
        eq(profileQuestions.state, "no"),
      ),
    )
    .returning({ id: profileQuestions.id });
  return rows.length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}
