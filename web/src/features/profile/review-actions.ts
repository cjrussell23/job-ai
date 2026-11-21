"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/features/members/session";
import { queue, queues } from "@/lib/queue";
import { answerNo, answerYes, reopenQuestion, skipQuestion } from "./questions";
import { startReview } from "./review";
import { acceptSuggestion, rejectSuggestion } from "./suggestions";

export type ReviewFormState = { error?: string; message?: string };

function refresh(jobId: string | null | undefined) {
  revalidatePath("/profile");
  if (jobId) revalidatePath(`/jobs/${jobId}`);
}

const jobIdFrom = (form: FormData) => z.uuid().safeParse(form.get("jobId")).data ?? null;

/** Asks for a profile review, general or against one job. Costs one model call. */
export async function startReviewAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const jobId = jobIdFrom(form);
  const started = await startReview(userId, jobId);
  if (started.ok) {
    const boss = await queue();
    await boss.send(queues.reviewProfile, { userId, reviewId: started.reviewId });
  }
  refresh(jobId);
}

export async function decideSuggestionAction(
  _: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Something went wrong. Reload and try again." };
  const accept = form.get("decision") === "accept";
  const result = accept
    ? await acceptSuggestion(userId, id.data)
    : await rejectSuggestion(userId, id.data);
  refresh(jobIdFrom(form));
  if (result.ok) return {};
  return {
    error:
      result.reason === "item_changed"
        ? "That item was edited since this was suggested, so it was left alone."
        : "That suggestion is no longer open.",
  };
}

export async function answerQuestionAction(
  _: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Something went wrong. Reload and try again." };
  const answer = form.get("answer");
  const result =
    answer === "yes"
      ? await answerYes(userId, id.data, String(form.get("example") ?? ""))
      : answer === "no"
        ? await answerNo(userId, id.data)
        : await skipQuestion(userId, id.data);
  refresh(jobIdFrom(form));
  if (result.ok) return {};
  return {
    error:
      result.reason === "example_needed"
        ? "Add one concrete example (at least a sentence) so it can go in your profile."
        : "That question is no longer open.",
  };
}

export async function reopenQuestionAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  await reopenQuestion(userId, id.data);
  refresh(null);
}
