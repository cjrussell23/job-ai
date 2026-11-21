"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireMember } from "@/features/members/session";
import { addWatchedCompany, removeWatchedCompany } from "./watched-companies";

export type FormState = { error?: string; message?: string };

const messages = {
  not_a_board:
    "That isn't a Greenhouse, Lever or Ashby job board link. Look for a link like boards.greenhouse.io/company, jobs.lever.co/company or jobs.ashbyhq.com/company on the company's careers page.",
  board_not_found: "That board couldn't be read. Check the link and try again.",
  already_watched: "That company is already watched.",
} as const;

export async function addCompanyAction(_: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireMember();
  const url = String(form.get("url") ?? "");
  const result = await addWatchedCompany(url, {
    addedByUserId: userId,
    name: String(form.get("name") ?? ""),
  });
  revalidatePath("/companies");
  return result.ok
    ? { message: `Now watching ${result.company.name}. Its jobs are read in every daily run.` }
    : { error: messages[result.reason] };
}

export async function removeCompanyAction(form: FormData): Promise<void> {
  await requireAdmin();
  await removeWatchedCompany(z.uuid().parse(form.get("id")));
  revalidatePath("/companies");
}
