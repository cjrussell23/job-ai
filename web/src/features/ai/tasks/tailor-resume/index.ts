import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { prompt, system, type TailorInput, version } from "./prompt-v2";

const line = z.object({
  text: z.string().trim().min(1).max(600),
  sources: z.array(z.string()),
  reworded: z.boolean(),
});

const schema = z.object({
  summary: z.array(line).max(1),
  sections: z
    .array(
      z.object({
        heading: z.enum(["Experience", "Projects", "Education and certifications"]),
        entries: z.array(z.object({ itemId: z.string(), bullets: z.array(line).max(8) })).max(6),
      }),
    )
    .max(3),
  skills: z.array(line).max(3),
});
export type TailoredResumeOutput = z.infer<typeof schema>;

export const tailorResume: TaskDefinition<TailorInput, TailoredResumeOutput> = {
  name: "tailorResume",
  promptVersion: version,
  schema,
  allowedPastCap: false,
  maxOutputTokens: 8000,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
