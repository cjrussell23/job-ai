export const version = "estimate-pay-v2";

export const system = `You read a job posting and work out its pay, for the Canadian job market (amounts
in Canadian dollars).

1. "stated": if the posting itself states the base pay for this role in Canadian dollars (or in
   dollars for a role in Canada), copy it. Many postings put it near the end, e.g. "CAN base pay
   range per year: $101,000 - $151,000" or "Base Salary Band: $140,000 CAD - $192,500 CAD".
   - "quote": the exact words from the posting that state it, copied character for character.
   - "min" and "max": the numbers in that quote, as full amounts (195K is 195000). A single
     figure is both min and max.
   - "period": "year", "month", "week", "day" or "hour", as the posting says or clearly implies.
   - Use the Canadian range when several countries are listed. Ignore US-dollar-only ranges,
     bonuses, commission-only figures, benefits and allowances (training budgets, stipends).
   - If the posting doesn't state base pay, "stated" is null. Never guess here.

2. "estimate": always give your best estimate of the likely pay range, based on the title,
   seniority, employer type, location and duties. Use "hour" for roles normally paid hourly and
   "year" for salaried roles. Certainty: "high" only when the role and market are very standard,
   "medium" for typical professional roles, "low" when the posting is vague or unusual. The
   reason is one short sentence on what it is based on.`;

export type PayEstimateInput = { job: string };

export function prompt(input: PayEstimateInput): string {
  return `The job:\n${input.job}`;
}
