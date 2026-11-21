"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/features/members/session";
import { deleteStandingResume, saveStandingResume } from "./standing";

export type BuilderState = { error?: string; message?: string };

const errors = {
  invalid_name: "Give the resume a name of up to 100 characters.",
  nothing_picked: "Pick at least one role, project, certification or skill.",
  not_found: "That resume no longer exists.",
  invalid_layout: "Those layout options aren't valid. Reload the page and try again.",
} as const;

export async function saveStandingResumeAction(
  _: BuilderState,
  form: FormData,
): Promise<BuilderState> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("id")).data ?? null;
  const itemIds = form.getAll("item").filter((v): v is string => typeof v === "string");
  let layout: unknown = {};
  try {
    layout = JSON.parse(String(form.get("layout") ?? "{}"));
  } catch {
    return { error: errors.invalid_layout };
  }
  const result = await saveStandingResume(
    userId,
    id,
    String(form.get("name") ?? ""),
    itemIds,
    layout,
  );
  if (!result.ok) return { error: errors[result.reason] };
  revalidatePath("/resumes");
  if (!id) redirect(`/resumes/${result.id}`);
  revalidatePath(`/resumes/${id}`);
  return { message: "Saved." };
}

export async function deleteStandingResumeAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("id"));
  if (id.success) await deleteStandingResume(userId, id.data);
  revalidatePath("/resumes");
  redirect("/resumes");
}
