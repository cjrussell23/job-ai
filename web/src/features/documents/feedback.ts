import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { documents } from "@/db/schema";
import { runTask } from "@/features/ai/run-task";
import { resumeReviewAspects, reviewResume } from "@/features/ai/tasks/review-resume";
import { recordedNos } from "@/features/profile/questions";
import { queue, queues } from "@/lib/queue";
import { resumeBodySchema } from "./body";
import { renderResumeText } from "./render";
import { getStandingResume } from "./standing";

export const feedbackSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("running"), requestedAt: z.string() }),
  z.object({
    state: z.literal("done"),
    at: z.string(),
    /** The resume version the feedback was written for. */
    version: z.number().int(),
    overall: z.string(),
    suggestions: z.array(
      z.object({
        aspect: z.enum(resumeReviewAspects),
        advice: z.string(),
        quote: z.string().nullable(),
      }),
    ),
  }),
  z.object({ state: z.literal("failed"), at: z.string(), failure: z.string() }),
]);
export type ResumeFeedback = z.infer<typeof feedbackSchema>;

export function readFeedback(raw: unknown): ResumeFeedback | null {
  const parsed = feedbackSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const failures = {
  cap_reached: "Your monthly AI allowance is used up, so feedback is paused until next month.",
  invalid_output: "The feedback could not be written reliably. Try again.",
  model_error: "The AI service did not respond. Try again in a few minutes.",
} as const;

/** A request still marked running after this long is treated as lost. */
const staleAfterMs = 10 * 60 * 1000;

export type StartFeedbackResult = { ok: true } | { ok: false; reason: "not_found" | "busy" };

export async function startFeedback(userId: string, id: string): Promise<StartFeedbackResult> {
  const doc = await getStandingResume(userId, id);
  if (!doc?.body) return { ok: false, reason: "not_found" };
  const current = readFeedback(doc.feedback);
  if (
    current?.state === "running" &&
    Date.now() - new Date(current.requestedAt).getTime() < staleAfterMs
  ) {
    return { ok: false, reason: "busy" };
  }
  await save(userId, id, { state: "running", requestedAt: new Date().toISOString() });
  await (await queue()).send(queues.reviewResume, { userId, documentId: id });
  return { ok: true };
}

async function save(userId: string, id: string, feedback: ResumeFeedback): Promise<void> {
  await db()
    .update(documents)
    .set({ feedback })
    .where(and(eq(documents.id, id), eq(documents.userId, userId)));
}

/** Worker job: one model call reading the saved resume as plain text. */
export async function runFeedback(userId: string, id: string): Promise<void> {
  const doc = await getStandingResume(userId, id);
  const body = resumeBodySchema.safeParse(doc?.body);
  if (!doc || !body.success) return;
  const result = await runTask(userId, reviewResume, {
    resume: renderResumeText(body.data),
    notToClaim: await recordedNos(userId),
  });
  const at = new Date().toISOString();
  await save(
    userId,
    id,
    result.ok
      ? { state: "done", at, version: doc.version, ...result.output }
      : { state: "failed", at, failure: failures[result.reason] },
  );
}
