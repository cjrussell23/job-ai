import { generateText, NoObjectGeneratedError, Output } from "ai";
import { getSettings } from "@/features/admin/settings";
import { log } from "@/lib/log";
import { languageModel } from "./model";
import { costUsd } from "./pricing";
import type { TaskDefinition, TaskResult } from "./task";
import { isOverCap, recordUsage } from "./usage";

/**
 * The only way the app calls a model. Reads the task's model from the admin
 * settings, enforces the member's monthly cap, records usage, and returns
 * output only if it matches the task's schema.
 */
export async function runTask<Input, Out>(
  /** The member the work is for, or null for app-level work shared by everyone. */
  userId: string | null,
  task: TaskDefinition<Input, Out>,
  input: Input,
): Promise<TaskResult<Out>> {
  if (userId && !task.allowedPastCap && (await isOverCap(userId))) {
    return { ok: false, reason: "cap_reached" };
  }

  const model = (await getSettings()).models[task.name];
  const { system, prompt } = task.buildPrompt(input);

  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const result = await generateText({
      model: languageModel(model),
      system,
      prompt,
      maxOutputTokens: task.maxOutputTokens,
      output: Output.object({ schema: task.schema }),
    });
    inputTokens = result.usage.inputTokens ?? 0;
    outputTokens = result.usage.outputTokens ?? 0;
    return { ok: true, output: result.output };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      inputTokens = error.usage?.inputTokens ?? 0;
      outputTokens = error.usage?.outputTokens ?? 0;
      log.warn({ task: task.name, model }, "model output did not match the task schema");
      return { ok: false, reason: "invalid_output" };
    }
    log.error({ err: error, task: task.name, model }, "model call failed");
    return { ok: false, reason: "model_error" };
  } finally {
    // Failed calls still cost money, so they count toward the cap.
    if (inputTokens > 0 || outputTokens > 0) {
      await recordUsage(userId, {
        task: task.name,
        model,
        promptVersion: task.promptVersion,
        inputTokens,
        outputTokens,
        costUsd: await costUsd(model, inputTokens, outputTokens),
      });
    }
  }
}
