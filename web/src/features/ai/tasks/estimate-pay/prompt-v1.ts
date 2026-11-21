export const version = "estimate-pay-v1";

export const system = `You estimate the likely pay range for a job posting that does not state pay, for
the Canadian job market (amounts in Canadian dollars). Base it on the title, seniority,
employer type, location and duties in the posting.

Use "hour" for roles normally paid hourly (retail, food service, trades, many part-time
roles) and "year" for salaried roles. Certainty: "high" only when the role and market are
very standard (for example a government classification or a common entry-level role),
"medium" for typical professional roles, "low" when the posting is vague or unusual.

The reason is one short sentence on what the estimate is based on.`;

export type PayEstimateInput = { job: string };

export function prompt(input: PayEstimateInput): string {
  return `The job:\n${input.job}`;
}
