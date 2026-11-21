"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { splitPosting } from "@/features/jobs/splits";
import { requireMember } from "@/features/members/session";
import { queue, queues } from "@/lib/queue";
import { dismissJob } from "./feed";
import { requestRescore } from "./rescore";

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

export type RescoreState = { error?: string; message?: string };

const refusals = {
  nothing_changed: "Nothing has changed since your jobs were scored.",
  limit_reached: "You've used today's rescore. It resets at midnight.",
  already_running: "A rescore is already running.",
} as const;

export async function rescoreAction(_: RescoreState): Promise<RescoreState> {
  const { userId } = await requireMember();
  const result = await requestRescore(userId);
  if (!result.ok) return { error: refusals[result.reason] };
  await (await queue()).send(queues.rescore, { userId, requestId: result.requestId });
  revalidatePath("/");
  return { message: "Rescoring your jobs. This takes a minute or two; refresh to see new scores." };
}
