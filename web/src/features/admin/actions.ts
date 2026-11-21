"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  inviteMember,
  reinstateMember,
  removeMember,
  setSpendCap,
  suspendMember,
} from "@/features/members/members";
import { requireAdmin } from "@/features/members/session";
import { type AiTask, aiTasks, setSetting } from "./settings";

export type ActionState = { message?: string; error?: string };

const dollarsToCents = (dollars: string) => Math.round(Number.parseFloat(dollars) * 100);

export async function inviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const email = z.email().safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid Google address." };
  const result = await inviteMember(email.data);
  revalidatePath("/admin");
  return result.ok
    ? { message: `Invited ${email.data}. They can now sign in with Google.` }
    : { error: "That address is already on the members list." };
}

const memberIdSchema = z.uuid();

export async function suspendAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = memberIdSchema.parse(form.get("memberId"));
  await suspendMember(id);
  revalidatePath("/admin");
}

export async function reinstateAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = memberIdSchema.parse(form.get("memberId"));
  await reinstateMember(id);
  revalidatePath("/admin");
}

export async function removeAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = memberIdSchema.parse(form.get("memberId"));
  await removeMember(id);
  revalidatePath("/admin");
}

export async function spendCapAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = memberIdSchema.parse(form.get("memberId"));
  const raw = String(form.get("spendCap") ?? "").trim();
  const cents = raw === "" ? null : dollarsToCents(raw);
  if (cents !== null && (!Number.isFinite(cents) || cents < 0)) return;
  await setSpendCap(id, cents);
  revalidatePath("/admin");
}

export async function aiSettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const models = Object.fromEntries(
    aiTasks.map((task) => [task, String(form.get(`model.${task}`) ?? "").trim()]),
  ) as Record<AiTask, string>;
  if (Object.values(models).some((model) => model === "")) {
    return { error: "Every task needs a model." };
  }
  const cents = dollarsToCents(String(form.get("defaultSpendCap") ?? ""));
  if (!Number.isFinite(cents) || cents < 0) return { error: "Enter a cap in dollars." };
  const results = await Promise.all([
    setSetting("models", models),
    setSetting("defaultSpendCapCents", cents),
  ]);
  revalidatePath("/admin");
  return results.every((r) => r.ok)
    ? { message: "Saved." }
    : { error: "Those values are not valid." };
}
