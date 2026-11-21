import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { prompt, type ResumeReviewInput, system, version } from "./prompt-v1";

export const resumeReviewAspects = [
  "impact",
  "wording",
  "relevance",
  "structure",
  "length",
  "skills",
  "summary",
] as const;

const schema = z.object({
  overall: z.string().trim().min(1).max(800),
  suggestions: z
    .array(
      z.object({
        aspect: z.enum(resumeReviewAspects),
        advice: z.string().trim().min(1).max(500),
        quote: z.string().trim().max(2000).nullable().default(null),
      }),
    )
    .max(8),
});
export type ResumeReviewOutput = z.infer<typeof schema>;

export const reviewResume: TaskDefinition<ResumeReviewInput, ResumeReviewOutput> = {
  name: "reviewResume",
  promptVersion: version,
  schema,
  allowedPastCap: false,
  maxOutputTokens: 3000,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
