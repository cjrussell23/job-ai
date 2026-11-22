import { generateText, isStepCount, NoObjectGeneratedError, Output } from "ai";
import { getSettings } from "@/features/admin/settings";
import { log } from "@/lib/log";
import { languageModel, webSearchTools } from "./model";
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
    // Web search tasks run in two calls: the model can't use tools while it is held to a
    // structured answer, so it researches freely first, then writes the answer from its notes.
    let research: { notes: string; urls: string[] } | null = null;
    const tools = task.webSearch ? webSearchTools() : undefined;
    if (tools) {
      const searched = await generateText({
        model: languageModel(model),
        system: `${system}\n\nFirst, search the web. Use the search tool several times, then write plain notes of what the pages say, with each page's URL.`,
        prompt,
        maxOutputTokens: task.maxOutputTokens,
        tools,
        stopWhen: isStepCount(8),
      });
      inputTokens += searched.totalUsage?.inputTokens ?? 0;
      outputTokens += searched.totalUsage?.outputTokens ?? 0;
      research = { notes: searched.text, urls: searchedUrls(searched) };
    }
    const result = await generateText({
      model: languageModel(model),
      system,
      prompt: research
        ? `${prompt}\n\nYour research notes:\n${research.notes}\n\nPages the search returned:\n${research.urls.join("\n")}`
        : prompt,
      maxOutputTokens: task.maxOutputTokens,
      output: Output.object({ schema: task.schema }),
    });
    inputTokens += result.totalUsage?.inputTokens ?? result.usage.inputTokens ?? 0;
    outputTokens += result.totalUsage?.outputTokens ?? result.usage.outputTokens ?? 0;
    return {
      ok: true,
      output: result.output,
      ...(task.webSearch ? { searchedUrls: research?.urls ?? [] } : {}),
    };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      inputTokens += error.usage?.inputTokens ?? 0;
      outputTokens += error.usage?.outputTokens ?? 0;
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

/** Every URL the web search returned across the call's steps, plus any cited sources. */
function searchedUrls(result: {
  steps: { toolResults: unknown[] }[];
  sources?: unknown[];
}): string[] {
  const urls = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      if (/^https?:\/\//.test(value)) urls.add(value);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  for (const step of result.steps) visit(step.toolResults);
  visit(result.sources ?? []);
  return [...urls];
}
