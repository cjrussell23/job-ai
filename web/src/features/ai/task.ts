import type { z } from "zod";
import type { AiTask } from "@/features/admin/ai-tasks";

/**
 * A named model call. Each task lives in its own folder under `tasks/`, with its
 * prompt in a versioned file beside it.
 */
export type TaskDefinition<Input, Output> = {
  name: AiTask;
  /** Bumped whenever the prompt changes, and recorded with each call. */
  promptVersion: string;
  schema: z.ZodType<Output>;
  /** Daily scoring keeps running at the cap; drafting and other optional work does not. */
  allowedPastCap: boolean;
  maxOutputTokens: number;
  buildPrompt: (input: Input) => { system: string; prompt: string };
};

export type TaskFailure = "cap_reached" | "invalid_output" | "model_error";

export type TaskResult<Output> = { ok: true; output: Output } | { ok: false; reason: TaskFailure };
