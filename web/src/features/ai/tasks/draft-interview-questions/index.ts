import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { type DraftQuestionsInput, prompt, system, version } from "./prompt-v1";

const schema = z.object({
  questions: z
    .array(
      z.object({
        category: z.enum(["behavioural", "technical", "project", "motivation", "job"]),
        question: z.string().trim().min(5).max(400),
        lookingFor: z.string().trim().max(300).default(""),
      }),
    )
    .min(3)
    .max(15),
});
export type DraftedQuestions = z.infer<typeof schema>;

export const draftInterviewQuestions: TaskDefinition<DraftQuestionsInput, DraftedQuestions> = {
  name: "draftInterviewQuestions",
  promptVersion: version,
  schema,
  allowedPastCap: false,
  maxOutputTokens: 4000,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
