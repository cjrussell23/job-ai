"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/features/members/session";
import { refilterJobForMember } from "@/features/scoring/rescore";
import { clearPay, confirmEstimate, enterPay } from "./member-pay";

export type PayFormState = { error?: string; message?: string };

const recheckedMessage =
  "Saved. Your pay limits were re-checked for this job; rescore to update its target fit.";

async function after(userId: string, jobId: string): Promise<void> {
  await refilterJobForMember(userId, jobId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/");
}

export async function enterPayAction(_: PayFormState, form: FormData): Promise<PayFormState> {
  const { userId } = await requireMember();
  const jobId = z.uuid().safeParse(form.get("jobId"));
  if (!jobId.success) return { error: "Unknown job." };
  const num = (name: string) => Number(String(form.get(name) ?? "").replace(/[$,\s]/g, ""));
  const min = num("payMin");
  // A single figure is a range of one.
  const max = String(form.get("payMax") ?? "").trim() === "" ? min : num("payMax");
  const result = await enterPay(userId, jobId.data, {
    payMin: min,
    payMax: max,
    payPeriod: form.get("payPeriod"),
  });
  if (!result.ok) {
    return {
      error:
        result.reason === "invalid"
          ? "Enter pay as numbers, with the top of the range at or above the bottom."
          : "That job no longer exists.",
    };
  }
  await after(userId, jobId.data);
  return { message: recheckedMessage };
}

export async function confirmEstimateAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const jobId = z.uuid().safeParse(form.get("jobId"));
  if (!jobId.success) return;
  const result = await confirmEstimate(userId, jobId.data);
  if (result.ok) await after(userId, jobId.data);
}

export async function clearPayAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const jobId = z.uuid().safeParse(form.get("jobId"));
  if (!jobId.success) return;
  await clearPay(userId, jobId.data);
  await after(userId, jobId.data);
}
