import { MockLanguageModelV4 } from "ai/test";
import { setModelFactoryForTests } from "@/features/ai/model";

export type FakeCall = { modelId: string; prompt: unknown };

/**
 * Replaces every model with one that returns `reply` as its text. Tests never call
 * a real model. Returns the calls made and a function to restore the real model.
 */
export function useFakeModel(reply: unknown, tokens = { input: 1000, output: 500 }) {
  const calls: FakeCall[] = [];
  const restore = setModelFactoryForTests(
    (modelId) =>
      new MockLanguageModelV4({
        modelId,
        doGenerate: async (options) => {
          calls.push({ modelId, prompt: options.prompt });
          return {
            content: [
              { type: "text", text: typeof reply === "string" ? reply : JSON.stringify(reply) },
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
