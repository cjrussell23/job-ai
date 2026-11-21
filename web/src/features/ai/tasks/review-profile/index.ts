import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { prompt, type ReviewInput, system, version } from "./prompt-v1";

const schema = z.object({
  suggestions: z
    .array(
      z.object({
        itemId: z.string(),
        kind: z.enum(["vague", "too_long", "repetition", "job_wording"]),
        proposed: z.string().trim().min(1).max(2000),
        reason: z.string().trim().min(1).max(300),
      }),
    )
    .max(12),
  questions: z
    .array(
      z.object({
        topic: z.string().trim().min(1).max(80),
        question: z.string().trim().min(5).max(300),
        trigger: z.enum(["recurring_requirement", "thin_item", "forgotten_category", "job"]),
        itemId: z.string().nullable().default(null),
        jobIds: z.array(z.string()).default([]),
      }),
    )
    .max(10),
});
export type ReviewOutput = z.infer<typeof schema>;

export const reviewProfile: TaskDefinition<ReviewInput, ReviewOutput> = {
  name: "reviewProfile",
  promptVersion: version,
  schema,
  allowedPastCap: false,
  maxOutputTokens: 8000,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
