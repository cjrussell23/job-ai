import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { type SavedAnswer, type StandardAnswers, savedAnswers, standardAnswers } from "@/db/schema";

export type { SavedAnswer, StandardAnswers };

const yesNo = z.boolean().nullable();
const short = (max: number) => z.string().trim().max(max).default("");

export const standardAnswersSchema = z.object({
  workAuthorized: yesNo.default(null),
  needsSponsorship: yesNo.default(null),
  willingToRelocate: yesNo.default(null),
  noticePeriod: short(100),
  salaryExpectation: short(100),
  howHeard: short(100),
  pronouns: short(40),
  gender: short(60),
  ethnicity: short(100),
  veteran: short(60),
  disability: short(60),
});

export const emptyStandardAnswers: StandardAnswers = standardAnswersSchema.parse({});

export async function getStandardAnswers(userId: string): Promise<StandardAnswers> {
  const [row] = await db()
    .select({ answers: standardAnswers.answers })
    .from(standardAnswers)
    .where(eq(standardAnswers.userId, userId));
  const parsed = standardAnswersSchema.safeParse(row?.answers ?? {});
  return parsed.success ? parsed.data : emptyStandardAnswers;
}

export type SaveResult = { ok: true } | { ok: false; message: string };

export async function saveStandardAnswers(userId: string, input: unknown): Promise<SaveResult> {
  const parsed = standardAnswersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the answers and try again." };
  const values = { answers: parsed.data, updatedAt: new Date() };
  await db()
    .insert(standardAnswers)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: standardAnswers.userId, set: values });
  return { ok: true };
}

/**
 * Pure: a question reduced to its words, so "First Name *" and "first name" are the same
 * question and a saved answer is found again on the next form.
 */
export function questionKey(question: string): string {
  return question
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(required\)|\(optional\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export async function listSavedAnswers(userId: string): Promise<SavedAnswer[]> {
  return db()
    .select()
    .from(savedAnswers)
    .where(eq(savedAnswers.userId, userId))
    .orderBy(asc(savedAnswers.question));
}

const savedAnswerSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(3000),
});

/** Keeps answers the member chose to remember, replacing older answers to the same question. */
export async function saveAnswers(
  userId: string,
  answers: { question: string; answer: string }[],
): Promise<number> {
  let saved = 0;
  for (const raw of answers.slice(0, 60)) {
    const parsed = savedAnswerSchema.safeParse(raw);
    if (!parsed.success) continue;
    const key = questionKey(parsed.data.question);
    if (!key) continue;
    const values = { ...parsed.data, updatedAt: new Date() };
    await db()
      .insert(savedAnswers)
      .values({ userId, questionKey: key, ...values })
      .onConflictDoUpdate({
        target: [savedAnswers.userId, savedAnswers.questionKey],
        set: values,
      });
    saved++;
  }
  return saved;
}

export async function updateSavedAnswer(
  userId: string,
  id: string,
  answer: string,
): Promise<SaveResult> {
  const text = answer.trim();
  if (!text) return { ok: false, message: "An answer can't be blank. Delete it instead." };
  const updated = await db()
    .update(savedAnswers)
    .set({ answer: text.slice(0, 3000), updatedAt: new Date() })
    .where(and(eq(savedAnswers.id, id), eq(savedAnswers.userId, userId)))
    .returning({ id: savedAnswers.id });
  return updated.length > 0
    ? { ok: true }
    : { ok: false, message: "That answer no longer exists." };
}

export async function deleteSavedAnswer(userId: string, id: string): Promise<void> {
  await db()
    .delete(savedAnswers)
    .where(and(eq(savedAnswers.id, id), eq(savedAnswers.userId, userId)));
}
