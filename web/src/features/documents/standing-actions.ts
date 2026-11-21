"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/features/members/session";
import { startPickForTarget } from "./pick";
import {
  deleteStandingResume,
  duplicateStandingResume,
  exactPageCount,
  saveStandingResume,
} from "./standing";

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

export async function duplicateStandingResumeAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) redirect("/resumes");
  const result = await duplicateStandingResume(userId, id.data);
  revalidatePath("/resumes");
  redirect(result.ok ? `/resumes/${result.id}` : "/resumes");
}

/** The exact page count of the resume as currently picked, from a real PDF render. */
export async function exactPagesAction(
  itemIds: string[],
  layout: unknown,
): Promise<{ pages: number } | { error: string }> {
  const { userId } = await requireMember();
  const ids = z.array(z.uuid()).max(1000).safeParse(itemIds);
  if (!ids.success) return { error: "Reload the page and try again." };
  const pages = await exactPageCount(userId, ids.data, layout);
  return pages === null ? { error: "Pick something first." } : { pages };
}

export async function pickForTargetAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const targetId = z.uuid().safeParse(form.get("targetId"));
  if (!targetId.success) redirect("/resumes");
  const result = await startPickForTarget(userId, targetId.data);
  revalidatePath("/resumes");
  redirect(result.ok ? `/resumes/${result.id}` : "/resumes");
}
