"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { splitPosting } from "@/features/jobs/splits";
import { requireMember } from "@/features/members/session";
import { dismissJob } from "./feed";

export async function dismissJobAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  await dismissJob(userId, z.uuid().parse(form.get("jobId")));
  revalidatePath("/");
}

/** "These are not the same job": affects every member, and is logged with who did it. */
export async function splitPostingAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  await splitPosting(userId, z.uuid().parse(form.get("postingId")));
  revalidatePath("/");
}
