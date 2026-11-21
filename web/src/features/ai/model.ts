import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { aiEnv } from "@/lib/env";

export type ModelFactory = (modelId: string) => LanguageModel;

let anthropicFactory: ModelFactory | undefined;

function defaultFactory(modelId: string): LanguageModel {
  anthropicFactory ??= createAnthropic({ apiKey: aiEnv().ANTHROPIC_API_KEY });
  return anthropicFactory(modelId);
}

let factory: ModelFactory = defaultFactory;

export function languageModel(modelId: string): LanguageModel {
  return factory(modelId);
}

/** Replaces the real model, for tests. Returns a function that restores it. */
export function setModelFactoryForTests(replacement: ModelFactory): () => void {
  factory = replacement;
  return () => {
    factory = defaultFactory;
  };
}
