"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/features/members/session";
import {
  addPreference,
  deletePreference,
  feedbackReasons,
  recordFeedback,
  updatePreference,
} from "./feedback";

const gradeSchema = z.object({
  jobId: z.uuid(),
  targetId: z.uuid().nullable(),
  kind: z.enum(["up", "down"]),
  reason: z.enum(Object.keys(feedbackReasons) as [keyof typeof feedbackReasons]).nullable(),
  comment: z.string().max(500).default(""),
});

export async function gradeAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const parsed = gradeSchema.safeParse({
    jobId: form.get("jobId"),
    targetId: form.get("targetId") || null,
    kind: form.get("kind"),
    reason: form.get("reason") || null,
    comment: form.get("comment") ?? "",
  });
  if (!parsed.success) return;
  await recordFeedback(userId, parsed.data);
  revalidatePath("/");
}

export type FormState = { error?: string; message?: string };

export async function addPreferenceAction(_: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireMember();
  const result = await addPreference(userId, String(form.get("statement") ?? ""));
  revalidatePath("/targets");
  revalidatePath("/");
  return result.ok ? { message: "Added." } : { error: "Write between 3 and 200 characters." };
}

export async function togglePreferenceAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  await updatePreference(userId, z.uuid().parse(form.get("id")), {
    active: form.get("active") === "true",
  });
  revalidatePath("/targets");
  revalidatePath("/");
}

export async function deletePreferenceAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  await deletePreference(userId, z.uuid().parse(form.get("id")));
  revalidatePath("/targets");
  revalidatePath("/");
}
