"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/features/members/session";
import { normalizeEmail } from "@/features/members/sign-in-decision";
import { deleteUserData } from "./user-data";

export type FormState = { error?: string };

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
