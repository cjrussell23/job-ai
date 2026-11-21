import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { prompt, system, version } from "./prompt-v1";

const parsedItem = z.object({
  type: z.enum(["role", "project", "skill", "certification", "story", "note"]),
  title: z.string(),
  organization: z.string(),
  content: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  bullets: z.array(z.string()).describe("Bullets under a role or project; empty otherwise."),
});

export const parsedResumeSchema = z.object({ items: z.array(parsedItem) });
export type ParsedResume = z.infer<typeof parsedResumeSchema>;

export const parseResume: TaskDefinition<{ resumeText: string }, ParsedResume> = {
  name: "parseResume",
  promptVersion: version,
  schema: parsedResumeSchema,
  // Building a profile is the first step for a new member; it should never be blocked.
  allowedPastCap: true,
  maxOutputTokens: 16000,
  buildPrompt: ({ resumeText }) => ({ system, prompt: prompt(resumeText) }),
};
