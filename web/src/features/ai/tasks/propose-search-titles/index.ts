import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { prompt, system, version } from "./prompt-v1";

type Input = Parameters<typeof prompt>[0];
const schema = z.object({ titles: z.array(z.string().trim().min(1).max(100)).min(1).max(8) });

export const proposeSearchTitles: TaskDefinition<Input, z.infer<typeof schema>> = {
  name: "proposeSearchTitles",
  promptVersion: version,
  schema,
  allowedPastCap: false,
  // Room for the model's thinking, which counts toward this limit.
  maxOutputTokens: 2000,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
