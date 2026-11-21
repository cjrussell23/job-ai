import { log } from "@/lib/log";
import { gateway } from "./model";

/** US dollars per token, as the AI Gateway reports them. */
export type Price = { input: number; output: number };
export type PriceList = Map<string, Price>;

// Used when the gateway's price list cannot be read or does not include the model:
// a deliberately high rate, so missing data can only overstate spend, never hide it.
export const fallbackPrice: Price = { input: 15 / 1_000_000, output: 75 / 1_000_000 };

const refreshAfterMs = 6 * 60 * 60 * 1000;
let cache: { prices: PriceList; loadedAt: number } | undefined;
let loader: () => Promise<PriceList> = loadFromGateway;

async function loadFromGateway(): Promise<PriceList> {
  const { models } = await gateway().getAvailableModels();
  const prices: PriceList = new Map();
  for (const model of models) {
    if (model.pricing) {
      prices.set(model.id, {
        input: Number(model.pricing.input),
        output: Number(model.pricing.output),
      });
    }
  }
  return prices;
}

/** The gateway's current price list, refreshed every few hours. */
export async function priceList(): Promise<PriceList> {
  if (cache && Date.now() - cache.loadedAt < refreshAfterMs) return cache.prices;
  try {
    cache = { prices: await loader(), loadedAt: Date.now() };
  } catch (error) {
    log.warn({ err: error }, "could not load AI Gateway prices; using the fallback rate");
    return cache?.prices ?? new Map();
  }
  return cache.prices;
}

export async function costUsd(model: string, inputTokens: number, outputTokens: number) {
  const price = (await priceList()).get(model);
  if (!price) log.warn({ model }, "no gateway price for model; costing at the fallback rate");
  const { input, output } = price ?? fallbackPrice;
  return inputTokens * input + outputTokens * output;
}

/** Replaces the gateway price list, for tests. Returns a function that restores it. */
export function setPriceListForTests(prices: PriceList): () => void {
  loader = async () => prices;
  cache = undefined;
  return () => {
    loader = loadFromGateway;
    cache = undefined;
  };
}

/** Ids of the models the gateway lists with prices, for the admin model picker. */
export async function gatewayModelIds(): Promise<string[]> {
  return [...(await priceList()).keys()].sort();
}
