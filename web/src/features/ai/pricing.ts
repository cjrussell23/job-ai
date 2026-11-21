/** Anthropic list prices in US dollars per million tokens (checked 2026-11-21). */
const pricesPerMillion: Record<string, { input: number; output: number }> = {
  // Haiku 5.5 rates apply to prompts up to 100K tokens; every task here stays well under.
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

// An unknown model is costed at the highest known rate, so a typo in the admin
// settings can only make spend look higher than it is, never lower.
const fallback = { input: 4, output: 20 };

export function isKnownModel(model: string): boolean {
  return model in pricesPerMillion;
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = pricesPerMillion[model] ?? fallback;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
