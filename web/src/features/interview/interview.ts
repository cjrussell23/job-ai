import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  type InterviewQuestion,
  type InterviewSet,
  interviewQuestions,
  interviewSets,
  type ProposedItem,
} from "@/db/schema";
import { runTask } from "@/features/ai/run-task";
import { draftInterviewQuestions } from "@/features/ai/tasks/draft-interview-questions";
import { rateInterviewAnswer } from "@/features/ai/tasks/rate-interview-answer";
import { applicationForJob } from "@/features/applications/applications";
import { jobForPrompt, jobsWithPostings } from "@/features/jobs/jobs";
import { profileForScoring } from "@/features/profile/for-scoring";
import { createItem, listItems } from "@/features/profile/profile";
import { targetForPrompt } from "@/features/targets/for-scoring";
import { listTargets } from "@/features/targets/targets";
import { queue, queues } from "@/lib/queue";

export type { InterviewQuestion, InterviewSet };

const failures = {
  cap_reached: "Your monthly AI allowance is used up, so this is paused until next month.",
  invalid_output: "That couldn't be done reliably. Try again.",
  model_error: "The AI service did not respond. Try again in a few minutes.",
} as const;

export async function listSets(userId: string): Promise<InterviewSet[]> {
  return db()
    .select()
    .from(interviewSets)
    .where(eq(interviewSets.userId, userId))
    .orderBy(desc(interviewSets.createdAt));
}

export async function getSet(userId: string, setId: string): Promise<InterviewSet | undefined> {
  const [set] = await db()
    .select()
    .from(interviewSets)
    .where(and(eq(interviewSets.id, setId), eq(interviewSets.userId, userId)));
  return set;
}

export async function questionsFor(userId: string, setId: string): Promise<InterviewQuestion[]> {
  return db()
    .select()
    .from(interviewQuestions)
    .where(and(eq(interviewQuestions.setId, setId), eq(interviewQuestions.userId, userId)))
    .orderBy(asc(interviewQuestions.position));
}

export type StartSetResult = { ok: true; id: string } | { ok: false; reason: "not_tracked" };

/**
 * Starts a question set: general when `jobId` is null, otherwise for a job the member
 * is tracking on their board. The worker writes the questions (one model call).
 */
export async function startSet(userId: string, jobId: string | null): Promise<StartSetResult> {
  if (jobId && !(await applicationForJob(userId, jobId)))
    return { ok: false, reason: "not_tracked" };
  const [set] = await db().insert(interviewSets).values({ userId, jobId }).returning();
  if (!set) throw new Error("interview set insert returned no row");
  await (await queue()).send(queues.draftInterviewQuestions, { userId, setId: set.id });
  return { ok: true, id: set.id };
}

/** Worker job: writes a set's questions from the profile, targets and job. */
export async function runSet(userId: string, setId: string): Promise<void> {
  const set = await getSet(userId, setId);
  if (!set || set.state !== "generating") return;
  const [profile, targets, job] = await Promise.all([
    profileForScoring(userId),
    listTargets(userId),
    set.jobId ? jobsWithPostings([set.jobId]).then((j) => j[0]) : Promise.resolve(undefined),
  ]);
  const result = await runTask(userId, draftInterviewQuestions, {
    profile,
    target:
      targets
        .filter((t) => t.active)
        .map((t) => targetForPrompt(t))
        .join("\n\n") || "Not given.",
    job: job ? jobForPrompt(job, 6000) : null,
  });
  if (!result.ok) {
    await db()
      .update(interviewSets)
      .set({ state: "failed", failure: failures[result.reason] })
      .where(and(eq(interviewSets.id, setId), eq(interviewSets.userId, userId)));
    return;
  }
  await db().transaction(async (tx) => {
    await tx
      .insert(interviewQuestions)
      .values(result.output.questions.map((q, position) => ({ setId, userId, position, ...q })));
    await tx
      .update(interviewSets)
      .set({ state: "ready", failure: null })
      .where(and(eq(interviewSets.id, setId), eq(interviewSets.userId, userId)));
  });
}

export async function deleteSet(userId: string, setId: string): Promise<void> {
  await db()
    .delete(interviewSets)
    .where(and(eq(interviewSets.id, setId), eq(interviewSets.userId, userId)));
}

async function getQuestion(userId: string, id: string): Promise<InterviewQuestion | undefined> {
  const [q] = await db()
    .select()
    .from(interviewQuestions)
    .where(and(eq(interviewQuestions.id, id), eq(interviewQuestions.userId, userId)));
  return q;
}

const answerSchema = z.string().trim().max(6000);

export async function saveAnswer(userId: string, id: string, raw: string): Promise<boolean> {
  const answer = answerSchema.safeParse(raw);
  if (!answer.success) return false;
  const updated = await db()
    .update(interviewQuestions)
    .set({ answer: answer.data, answeredAt: new Date() })
    .where(and(eq(interviewQuestions.id, id), eq(interviewQuestions.userId, userId)))
    .returning({ id: interviewQuestions.id });
  return updated.length > 0;
}

export type RateResult = { ok: true } | { ok: false; reason: "not_found" | "too_short" | "busy" };

/** Asks the worker to rate the saved answer (one model call). */
export async function startRating(userId: string, id: string): Promise<RateResult> {
  const question = await getQuestion(userId, id);
  if (!question) return { ok: false, reason: "not_found" };
  if (question.ratingState === "rating") return { ok: false, reason: "busy" };
  if (question.answer.trim().length < 40) return { ok: false, reason: "too_short" };
  await db()
    .update(interviewQuestions)
    .set({ ratingState: "rating" })
    .where(and(eq(interviewQuestions.id, id), eq(interviewQuestions.userId, userId)));
  await (await queue()).send(queues.rateInterviewAnswer, { userId, questionId: id });
  return { ok: true };
}

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9%$ ]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2);

/**
 * Pure: whether a proposed profile item really comes from the member's answer (rule 1):
 * most of its words appear there, and every number in it does.
 */
export function proposalComesFromAnswer(content: string, answer: string): boolean {
  const have = new Set(wordsOf(answer));
  const want = wordsOf(content);
  if (want.length === 0) return false;
  const shared = want.filter((w) => have.has(w)).length;
  const numbers = content.match(/\d[\d,.]*/g) ?? [];
  const answerDigits = answer.replace(/[,\s]/g, "");
  return (
    shared / want.length >= 0.7 && numbers.every((n) => answerDigits.includes(n.replace(/,/g, "")))
  );
}

/** Worker job: rates an answer and, where it adds something new, offers a profile item. */
export async function runRating(userId: string, id: string): Promise<void> {
  const question = await getQuestion(userId, id);
  if (!question || question.ratingState !== "rating") return;
  const set = await getSet(userId, question.setId);
  const [items, job] = await Promise.all([
    listItems(userId),
    set?.jobId ? jobsWithPostings([set.jobId]).then((j) => j[0]) : Promise.resolve(undefined),
  ]);
  const usable = items.filter((i) => i.visibility !== "never");
  const profile = usable
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
  const answer = question.answer;
  const result = await runTask(userId, rateInterviewAnswer, {
    question: question.question,
    lookingFor: question.lookingFor,
    answer,
    profile,
    job: job ? jobForPrompt(job, 4000) : null,
  });
  const where = and(eq(interviewQuestions.id, id), eq(interviewQuestions.userId, userId));
  if (!result.ok) {
    await db().update(interviewQuestions).set({ ratingState: "failed" }).where(where);
    return;
  }
  const { score, summary, strengths, improvements, newItem } = result.output;
  const parents = new Set(
    usable.filter((i) => i.type === "role" || i.type === "project").map((i) => i.id),
  );
  let proposal: ProposedItem | null = null;
  if (newItem && proposalComesFromAnswer(newItem.content, answer)) {
    if (newItem.type === "story") {
      proposal = {
        type: "story",
        parentId: null,
        title: newItem.title || "Interview story",
        content: newItem.content,
      };
    } else if (newItem.parentId && parents.has(newItem.parentId)) {
      proposal = {
        type: "bullet",
        parentId: newItem.parentId,
        title: "",
        content: newItem.content,
      };
    }
  }
  await db()
    .update(interviewQuestions)
    .set({
      ratingState: "rated",
      score,
      feedback: { summary, strengths, improvements },
      ratedAnswer: answer,
      ratedAt: new Date(),
      // A new rating replaces an open proposal; an accepted one is history.
      ...(question.proposalState === "accepted"
        ? {}
        : { proposal, proposalState: proposal ? "open" : null }),
    })
    .where(where);
}

export type DecideResult = { ok: true } | { ok: false; reason: "not_found" | "invalid" };

/** Accepts or rejects a proposed profile item (rule 3: nothing is added silently). */
export async function decideProposal(
  userId: string,
  id: string,
  accept: boolean,
): Promise<DecideResult> {
  const question = await getQuestion(userId, id);
  if (!question?.proposal || question.proposalState !== "open")
    return { ok: false, reason: "not_found" };
  const where = and(eq(interviewQuestions.id, id), eq(interviewQuestions.userId, userId));
  if (!accept) {
    await db().update(interviewQuestions).set({ proposalState: "rejected" }).where(where);
    return { ok: true };
  }
  const p = question.proposal;
  const created = await createItem(
    userId,
    p.type === "story"
      ? { type: "story", title: p.title, content: p.content }
      : { type: "bullet", parentId: p.parentId, content: p.content },
    "interview",
  );
  if (!created.ok) return { ok: false, reason: "invalid" };
  await db()
    .update(interviewQuestions)
    .set({ proposalState: "accepted", proposalItemId: created.id })
    .where(where);
  return { ok: true };
}

/** Sets with their job's title and company, for the page's list. */
export async function setsWithJobs(
  userId: string,
): Promise<(InterviewSet & { jobTitle: string | null; questions: InterviewQuestion[] })[]> {
  const sets = await listSets(userId);
  const ids = sets.map((s) => s.id);
  const [questions, jobs] = await Promise.all([
    ids.length
      ? db()
          .select()
          .from(interviewQuestions)
          .where(and(eq(interviewQuestions.userId, userId), inArray(interviewQuestions.setId, ids)))
          .orderBy(asc(interviewQuestions.position))
      : Promise.resolve([]),
    jobsWithPostings(sets.flatMap((s) => (s.jobId ? [s.jobId] : []))),
  ]);
  const jobName = new Map(jobs.map((j) => [j.id, `${j.title} at ${j.company}`]));
  return sets.map((s) => ({
    ...s,
    jobTitle: s.jobId ? (jobName.get(s.jobId) ?? null) : null,
    questions: questions.filter((q) => q.setId === s.id),
  }));
}
