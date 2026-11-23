import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { type CoverLetterInput, prompt, system, version } from "./prompt-v2";

const schema = z.object({
  greeting: z.string().trim().min(1).max(120),
  paragraphs: z
    .array(z.object({ text: z.string().trim().min(1).max(1500), sources: z.array(z.string()) }))
    .min(2)
    .max(5),
  closing: z.string().trim().min(1).max(60),
});
export type CoverLetterOutput = z.infer<typeof schema>;

export const draftCoverLetter: TaskDefinition<CoverLetterInput, CoverLetterOutput> = {
  name: "draftCoverLetter",
  promptVersion: version,
  schema,
  allowedPastCap: false,
  maxOutputTokens: 6000,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
