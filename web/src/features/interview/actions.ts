"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/features/members/session";
import { decideProposal, deleteSet, saveAnswer, startRating, startSet } from "./interview";

export type AnswerState = { error?: string; message?: string };

export async function startSetAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const jobId = z.uuid().safeParse(form.get("jobId"));
  const result = await startSet(userId, jobId.success ? jobId.data : null);
  revalidatePath("/interview");
  if (result.ok) redirect(`/interview?set=${result.id}`);
}

export async function deleteSetAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("setId"));
  if (id.success) await deleteSet(userId, id.data);
  revalidatePath("/interview");
  redirect("/interview");
}

/** Saves the answer and, when asked, has it rated. */
export async function answerAction(_: AnswerState, form: FormData): Promise<AnswerState> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("questionId"));
  if (!id.success) return { error: "Unknown question." };
  const saved = await saveAnswer(userId, id.data, String(form.get("answer") ?? ""));
  if (!saved) return { error: "Keep the answer under 6,000 characters." };
  revalidatePath("/interview");
  if (form.get("intent") !== "rate") return { message: "Saved." };
  const rated = await startRating(userId, id.data);
  if (rated.ok) return { message: "Saved. Rating your answer…" };
  return {
    error:
      rated.reason === "too_short"
        ? "Write a bit more (a few sentences) before asking for a rating."
        : rated.reason === "busy"
          ? "Already rating this answer."
          : "That question no longer exists.",
  };
}

export async function decideProposalAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("questionId"));
  if (!id.success) return;
  await decideProposal(userId, id.data, form.get("decision") === "accept");
  revalidatePath("/interview");
  revalidatePath("/profile");
}
