import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { prompt, type SummaryInput, system, version } from "./prompt-v1";

const schema = z.object({
  headline: z.string().trim().min(1).max(200),
  points: z
    .array(
      z.object({
        kind: z.enum(["plus", "watch", "check"]),
        text: z.string().trim().min(1).max(300),
      }),
    )
    .min(1)
    .max(5),
});
export type SummaryOutput = z.infer<typeof schema>;

export const summarizeMatch: TaskDefinition<SummaryInput, SummaryOutput> = {
  name: "summarizeMatch",
  promptVersion: version,
  schema,
  allowedPastCap: false,
  maxOutputTokens: 1200,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
