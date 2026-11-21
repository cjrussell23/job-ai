import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { type LearnInput, prompt, system, version } from "./prompt-v1";

const schema = z.object({
  statements: z.array(z.string().trim().min(3).max(120)).max(8),
});

export const learnPreferences: TaskDefinition<LearnInput, z.infer<typeof schema>> = {
  name: "learnPreferences",
  promptVersion: version,
  schema,
  allowedPastCap: false,
  // Room for the model's thinking, which counts toward this limit.
  maxOutputTokens: 2000,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
