import type { ScrapedPosting } from "./source";

type Pay = NonNullable<ScrapedPosting["pay"]>;

const periods: [RegExp, Pay["period"]][] = [
  [/\b(hour|hourly|hr|\/h)\b/i, "hour"],
  [/\b(day|daily)\b/i, "day"],
  [/\b(week|weekly)\b/i, "week"],
  [/\b(month|monthly)\b/i, "month"],
  [/\b(year|yearly|annual|annually|salary)\b/i, "year"],
];

function amount(raw: string): number | null {
  const match = raw.match(/([\d,.]+)\s*(k)?/i);
  if (!match?.[1]) return null;
  const value = Number.parseFloat(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2] ? value * 1000 : value;
}

/** Reads pay written as text, e.g. "$100,000.00 to $120,000.00 annually" or "$25 hourly". */
export function parsePayText(text: string | null | undefined): Pay | null {
  if (!text) return null;
  const amounts = [...text.matchAll(/\$\s*[\d,.]+\s*k?/gi)].map((m) => amount(m[0].slice(1)));
  const valid = amounts.filter((a): a is number => a !== null);
  if (valid.length === 0) return null;
  // Bi-weekly pay (common in government postings) has no period of its own: annualize it.
  if (/\bbi-?weekly\b/i.test(text)) {
    const [min, max] = [valid[0], valid[1] ?? valid[0]].map((a) =>
      a === undefined ? null : Math.round(a * 26),
    );
    return { min: min ?? null, max: max ?? null, period: "year" };
  }
  const period = periods.find(([pattern]) => pattern.test(text))?.[1];
  if (!period) return null;
  return { min: valid[0] ?? null, max: valid[1] ?? valid[0] ?? null, period };
}
