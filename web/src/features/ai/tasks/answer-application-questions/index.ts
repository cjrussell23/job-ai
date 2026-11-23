import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { type AnswerQuestionsInput, prompt, system, version } from "./prompt-v1";

const schema = z.object({
  answers: z
    .array(
      z.object({
        key: z.string().min(1).max(200),
        answer: z.string().trim().max(3000).nullable(),
        sourceIds: z.array(z.string()).max(20).default([]),
      }),
    )
    .max(60),
});
export type AnsweredQuestions = z.infer<typeof schema>;

export const answerApplicationQuestions: TaskDefinition<AnswerQuestionsInput, AnsweredQuestions> = {
  name: "answerApplicationQuestions",
  promptVersion: version,
  schema,
  allowedPastCap: false,
  maxOutputTokens: 6000,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
