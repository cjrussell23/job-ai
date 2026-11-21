import { createGateway, type LanguageModel } from "ai";
import { aiEnv } from "@/lib/env";

export type ModelFactory = (modelId: string) => LanguageModel;

let gatewayProvider: ReturnType<typeof createGateway> | undefined;

/** The Vercel AI Gateway, which routes "provider/model" ids to any supported provider. */
export function gateway() {
  gatewayProvider ??= createGateway({ apiKey: aiEnv().AI_GATEWAY_API_KEY });
  return gatewayProvider;
}

function defaultFactory(modelId: string): LanguageModel {
  return gateway()(modelId);
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
