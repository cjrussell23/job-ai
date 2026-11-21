import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { type PayEstimateInput, prompt, system, version } from "./prompt-v1";

const schema = z
  .object({
    min: z.number().positive(),
    max: z.number().positive(),
    period: z.enum(["hour", "year"]),
    certainty: z.enum(["low", "medium", "high"]),
    reason: z.string().trim().min(1).max(300),
  })
  .refine((e) => e.max >= e.min, "max must not be below min");
export type PayEstimate = z.infer<typeof schema>;

export const estimatePay: TaskDefinition<PayEstimateInput, PayEstimate> = {
  name: "estimatePay",
  promptVersion: version,
  schema,
  allowedPastCap: true,
  // Room for the model's thinking, which counts toward this limit.
  maxOutputTokens: 1500,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
