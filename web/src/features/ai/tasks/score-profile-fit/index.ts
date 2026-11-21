import type { TaskDefinition } from "@/features/ai/task";
import { type Fit, fitSchema } from "../score-target-fit";
import { type ProfileFitInput, prompt, system, version } from "./prompt-v1";

export const scoreProfileFit: TaskDefinition<ProfileFitInput, Fit> = {
  name: "scoreProfileFit",
  promptVersion: version,
  schema: fitSchema,
  allowedPastCap: true,
  // Room for the model's thinking, which counts toward this limit.
  maxOutputTokens: 2000,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
