"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/features/members/session";
import { log } from "@/lib/log";
import { queue, queues } from "@/lib/queue";
import {
  approveSearchTitles,
  createTarget,
  deleteTarget,
  setSearchTitleProposal,
  setTargetActive,
  updateTarget,
} from "./targets";

export type FormState = { error?: string; message?: string };

const splitList = (value: string) =>
  value
    .split(/[\n,;]/)
    .map((part) => part.trim())
    .filter(Boolean);

function targetFrom(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const checked = (name: string) => form.get(name) === "on";
  const minPay = text("minPay");
  const hours = text("desiredHours");
  return {
    roleType: text("roleType"),
    locations: splitList(text("locations")),
    workplace: text("workplace"),
    locationIsFirm: checked("locationIsFirm"),
    hideUnknownLocation: checked("hideUnknownLocation"),
    minPayCents: minPay === "" ? null : Math.round(Number.parseFloat(minPay) * 100),
    payBasis: text("payBasis"),
    desiredHours: hours === "" ? null : Number.parseInt(hours, 10),
    payIsFirm: checked("payIsFirm"),
    hideUnknownPay: checked("hideUnknownPay"),
    note: text("note"),
  };
}

async function requestTitles(userId: string, targetId: string) {
  await setSearchTitleProposal(userId, targetId, { state: "proposing" });
  try {
    await (await queue()).send(queues.proposeSearchTitles, { userId, targetId });
  } catch (error) {
    // Never leave the target stuck at "suggesting": mark it failed so the user can retry.
    log.error({ err: error, targetId }, "could not queue search title suggestion");
    await setSearchTitleProposal(userId, targetId, { state: "failed" });
  }
}

export async function saveTargetAction(_: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireMember();
  const id = String(form.get("id") ?? "");
  const input = targetFrom(form);
  const result = id ? await updateTarget(userId, id, input) : await createTarget(userId, input);
  if (!result.ok) {
    return {
      error: "Check the fields: a role type is required, and pay and hours must be numbers.",
    };
  }
  // A new or changed role type gets fresh search title suggestions.
  if (result.roleTypeChanged) await requestTitles(userId, result.id);
  revalidatePath("/targets");
  return { message: "Saved." };
}

export async function approveTitlesAction(_: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Unknown job target." };
  const ok = await approveSearchTitles(
    userId,
    id.data,
    splitList(String(form.get("titles") ?? "")),
  );
  revalidatePath("/targets");
  return ok
    ? { message: "Search titles saved." }
    : { error: "Keep it to 20 titles of 100 characters or fewer." };
}

export async function suggestTitlesAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  await requestTitles(userId, z.uuid().parse(form.get("id")));
  revalidatePath("/targets");
}

export async function setActiveAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  await setTargetActive(userId, z.uuid().parse(form.get("id")), form.get("active") === "true");
  revalidatePath("/targets");
}

export async function deleteTargetAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  await deleteTarget(userId, z.uuid().parse(form.get("id")));
  revalidatePath("/targets");
}
