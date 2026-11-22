import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { prompt, system, type TargetFitInput, version } from "./prompt-v2";

// Models sometimes give a fifth point or a long one; keep the first four, trimmed,
// rather than failing the whole score.
const points = z
  .array(z.string().trim().min(1))
  .default([])
  .transform((list) => list.slice(0, 4).map((p) => (p.length > 200 ? `${p.slice(0, 197)}…` : p)));

export const fitSchema = z.object({
  score: z.int().min(0).max(100),
  reason: z
    .string()
    .trim()
    .min(1)
    .transform((r) => (r.length > 300 ? `${r.slice(0, 297)}…` : r)),
  pros: points,
  cons: points,
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
