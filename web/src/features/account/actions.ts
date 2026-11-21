"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setDiscordUserId, updateMemberSettings } from "@/features/members/members";
import { requireMember } from "@/features/members/session";
import { normalizeEmail } from "@/features/members/sign-in-decision";
import { sendDiscordDirectMessage, trySend } from "@/features/notifications/discord";
import { deleteUserData } from "./user-data";

export type FormState = { error?: string; message?: string };

export async function deleteAccountAction(_: FormState, form: FormData): Promise<FormState> {
  const { userId, member } = await requireMember();
  if (normalizeEmail(String(form.get("confirmEmail") ?? "")) !== member.email) {
    return { error: "Type your Google address exactly to confirm." };
  }
  const result = await deleteUserData(userId);
  if (!result.ok) {
    return {
      error:
        result.reason === "only_admin"
          ? "You are the only admin, so your account cannot be deleted here."
          : "Your account could not be found.",
    };
  }
  // Sessions were deleted with the account, so this lands on the sign-in page signed out.
  redirect("/sign-in?deleted=1");
}

export async function feedSettingsAction(_: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireMember();
  const result = await updateMemberSettings(userId, {
    scoreThreshold: Number(form.get("scoreThreshold")),
    targetFitWeight: Number(form.get("targetFitWeight")),
  });
  revalidatePath("/");
  revalidatePath("/account");
  return result.ok ? { message: "Saved." } : { error: "Use whole numbers from 0 to 100." };
}

export async function discordAction(_: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireMember();
  const discordUserId = String(form.get("discordUserId") ?? "").trim();
  const saved = await setDiscordUserId(userId, discordUserId);
  if (!saved.ok) {
    return {
      error: "A Discord user ID is a long number, like 123456789012345678. See the steps below.",
    };
  }
  revalidatePath("/account");
  if (discordUserId === "") return { message: "Discord messages turned off." };
  const test = await trySend(
    sendDiscordDirectMessage,
    discordUserId,
    "You're connected. New job matches above your threshold will arrive here after each morning's run.",
  );
  if (test.ok) return { message: "Saved. Check Discord for a test message." };
  return test.reason === "not_configured"
    ? { message: "Saved. Messages start once the admin sets up the Discord bot." }
    : {
        error:
          "Saved, but the test message failed. Make sure you share a server with the bot and allow direct messages from its members.",
      };
}
