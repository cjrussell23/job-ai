import { MockLanguageModelV4 } from "ai/test";
import { setModelFactoryForTests } from "@/features/ai/model";

export type FakeCall = { modelId: string; prompt: unknown };

/**
 * Replaces every model with one that returns `reply` as its text. Tests never call
 * a real model. Returns the calls made and a function to restore the real model.
 */
export function fakeModel(
  /** The model's reply, or a function choosing one from the prompt sent. */
  reply: unknown | ((prompt: string) => unknown),
  tokens = { input: 1000, output: 500 },
) {
  const calls: FakeCall[] = [];
  const restore = setModelFactoryForTests(
    (modelId) =>
      new MockLanguageModelV4({
        modelId,
        doGenerate: async (options) => {
          calls.push({ modelId, prompt: options.prompt });
          const answer =
            typeof reply === "function" ? reply(JSON.stringify(options.prompt)) : reply;
          return {
            content: [
              { type: "text", text: typeof answer === "string" ? answer : JSON.stringify(answer) },
            ],
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: {
                total: tokens.input,
                noCache: tokens.input,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: tokens.output, text: tokens.output, reasoning: undefined },
            },
            warnings: [],
          };
        },
      }),
  );
  return { calls, restore };
}
