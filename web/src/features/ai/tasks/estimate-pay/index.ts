import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { type PayEstimateInput, prompt, system, version } from "./prompt-v2";

const schema = z.object({
  stated: z
    .object({
      min: z.number().positive(),
      max: z.number().positive(),
      period: z.enum(["hour", "day", "week", "month", "year"]),
      quote: z.string().trim().min(1).max(500),
    })
    .refine((s) => s.max >= s.min, "max must not be below min")
    .nullable()
    .default(null),
  estimate: z
    .object({
      min: z.number().positive(),
      max: z.number().positive(),
      period: z.enum(["hour", "year"]),
      certainty: z.enum(["low", "medium", "high"]),
      reason: z.string().trim().min(1).max(300),
    })
    .refine((e) => e.max >= e.min, "max must not be below min"),
});
export type PayReading = z.infer<typeof schema>;
export type PayEstimate = PayReading["estimate"];

export const estimatePay: TaskDefinition<PayEstimateInput, PayReading> = {
  name: "estimatePay",
  promptVersion: version,
  schema,
  allowedPastCap: true,
  // Room for the model's thinking, which counts toward this limit.
  maxOutputTokens: 2000,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
