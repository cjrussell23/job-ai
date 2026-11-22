import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { prompt, system, type TargetFitInput, version } from "./prompt-v2";

const point = z.string().trim().min(1).max(200);

export const fitSchema = z.object({
  score: z.int().min(0).max(100),
  reason: z.string().trim().min(1).max(300),
  pros: z.array(point).max(4).default([]),
  cons: z.array(point).max(4).default([]),
});
export type Fit = z.infer<typeof fitSchema>;

export const scoreTargetFit: TaskDefinition<TargetFitInput, Fit> = {
  name: "scoreTargetFit",
  promptVersion: version,
  schema: fitSchema,
  // Daily scoring keeps the feed alive even at the spend cap.
  allowedPastCap: true,
  // Room for the model's thinking, which counts toward this limit.
  maxOutputTokens: 2000,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
