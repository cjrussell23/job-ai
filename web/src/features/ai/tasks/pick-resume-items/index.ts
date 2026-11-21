import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { type PickInput, prompt, system, version } from "./prompt-v1";

const schema = z.object({
  itemIds: z.array(z.string()).max(400),
  summaryId: z.string().nullable().default(null),
});
export type PickOutput = z.infer<typeof schema>;

export const pickResumeItems: TaskDefinition<PickInput, PickOutput> = {
  name: "pickResumeItems",
  promptVersion: version,
  schema,
  allowedPastCap: false,
  maxOutputTokens: 6000,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
