"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/features/members/session";
import {
  attachDocument,
  removeApplication,
  setNotes,
  setStatus,
  statuses,
  trackJob,
} from "./applications";

function refresh(jobId?: string) {
  revalidatePath("/");
  revalidatePath("/board");
  if (jobId) revalidatePath(`/jobs/${jobId}`);
}

const trackSchema = z.object({
  jobId: z.uuid(),
  targetId: z.uuid().nullable(),
  status: z.enum(["saved", "applied"]),
});

export async function trackJobAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const parsed = trackSchema.safeParse({
    jobId: form.get("jobId"),
    targetId: form.get("targetId") || null,
    status: form.get("status"),
  });
  if (!parsed.success) return;
  await trackJob(userId, parsed.data.jobId, parsed.data.status, parsed.data.targetId);
  refresh(parsed.data.jobId);
}

export async function setStatusAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("id"));
  const status = z.enum(statuses).safeParse(form.get("status"));
  if (!id.success || !status.success) return;
  await setStatus(userId, id.data, status.data);
  refresh(z.uuid().safeParse(form.get("jobId")).data);
}

export type AttachState = { error?: string; message?: string };

const attachErrors = {
  not_found: "That document no longer exists.",
  not_approved: "Only approved documents can be used in an application. Approve it first.",
  wrong_kind: "That document isn't for this job.",
} as const;

export async function attachDocumentsAction(_: AttachState, form: FormData): Promise<AttachState> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Something went wrong. Reload and try again." };
  const optionalId = (key: string) => z.uuid().safeParse(form.get(key)).data ?? null;
  for (const kind of ["resume", "cover_letter"] as const) {
    const result = await attachDocument(userId, id.data, optionalId(kind), kind);
    if (!result.ok) return { error: attachErrors[result.reason] };
  }
  await setNotes(userId, id.data, String(form.get("notes") ?? ""));
  refresh(z.uuid().safeParse(form.get("jobId")).data);
  return { message: "Saved." };
}

export async function removeApplicationAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  await removeApplication(userId, id.data);
  refresh(z.uuid().safeParse(form.get("jobId")).data);
}
