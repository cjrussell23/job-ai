import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { prompt, type RateAnswerInput, system, version } from "./prompt-v1";

const point = z.string().trim().min(1).max(300);

const schema = z.object({
  score: z.int().min(0).max(100),
  summary: z.string().trim().min(1).max(400),
  strengths: z.array(point).max(3).default([]),
  improvements: z.array(point).max(3).default([]),
  newItem: z
    .object({
      type: z.enum(["story", "bullet"]),
      parentId: z.string().nullable().default(null),
      title: z.string().trim().max(200).default(""),
      content: z.string().trim().min(10).max(2000),
    })
    .nullable()
    .default(null),
});
export type AnswerRating = z.infer<typeof schema>;

export const rateInterviewAnswer: TaskDefinition<RateAnswerInput, AnswerRating> = {
  name: "rateInterviewAnswer",
  promptVersion: version,
  schema,
  allowedPastCap: false,
  maxOutputTokens: 2500,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
