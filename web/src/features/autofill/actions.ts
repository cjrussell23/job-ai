"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/features/members/session";
import { deleteSavedAnswer, saveStandardAnswers, updateSavedAnswer } from "./answers";
import { startApplySession } from "./sessions";

export type AutofillStart =
  | { ok: true; ticket: string; applyUrl: string }
  | { ok: false; message: string };

/** Starts an apply session; the page hands the ticket to the extension (ADR 0005). */
export async function startAutofillAction(jobId: string): Promise<AutofillStart> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(jobId);
  if (!id.success) return { ok: false, message: "Something went wrong. Reload and try again." };
  const result = await startApplySession(userId, id.data, null);
  revalidatePath(`/jobs/${id.data}`);
  revalidatePath("/board");
  if (result.ok) return result;
  return {
    ok: false,
    message:
      result.reason === "no_link"
        ? "This job has no posting link to apply through."
        : "That job no longer exists.",
  };
}

export type FormState = { error?: string; message?: string };

const yesNo = (value: FormDataEntryValue | null) =>
  value === "yes" ? true : value === "no" ? false : null;

export async function saveStandardAnswersAction(_: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireMember();
  const text = (key: string) => String(form.get(key) ?? "");
  const result = await saveStandardAnswers(userId, {
    workAuthorized: yesNo(form.get("workAuthorized")),
    needsSponsorship: yesNo(form.get("needsSponsorship")),
    willingToRelocate: yesNo(form.get("willingToRelocate")),
    noticePeriod: text("noticePeriod"),
    salaryExpectation: text("salaryExpectation"),
    howHeard: text("howHeard"),
    pronouns: text("pronouns"),
    gender: text("gender"),
    ethnicity: text("ethnicity"),
    veteran: text("veteran"),
    disability: text("disability"),
  });
  revalidatePath("/autofill");
  return result.ok ? { message: "Saved." } : { error: result.message };
}

export async function updateSavedAnswerAction(_: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Something went wrong. Reload and try again." };
  const result = await updateSavedAnswer(userId, id.data, String(form.get("answer") ?? ""));
  revalidatePath("/autofill");
  return result.ok ? { message: "Saved." } : { error: result.message };
}

export async function deleteSavedAnswerAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  await deleteSavedAnswer(userId, id.data);
  revalidatePath("/autofill");
}
