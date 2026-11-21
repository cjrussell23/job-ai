"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireMember } from "@/features/members/session";
import { queue, queues } from "@/lib/queue";
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

/** Watches a suggested company; its board was already found, so this is the same as adding it. */
export async function watchSuggestedAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const url = z.url().safeParse(form.get("url"));
  if (!url.success) return;
  await addWatchedCompany(url.data, {
    addedByUserId: userId,
    name: String(form.get("name") ?? ""),
  });
  revalidatePath("/companies");
}

/** Asks the worker to look for more companies' boards now, instead of after the next run. */
export async function findBoardsAction(): Promise<void> {
  await requireMember();
  await (await queue()).send(
    queues.checkCompanyBoards,
    {},
    { singletonKey: "check-company-boards" },
  );
  revalidatePath("/companies");
}
