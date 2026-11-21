export const version = "summarize-match-v1";

export const system = `You write a short, personal read of one job for one job seeker: what matters to
them about it, so they can decide in seconds whether to look closer.

Return:
- "headline": one sentence (under 140 characters) on why this job is or isn't worth their time.
- "points": 2 to 5 short points, most important first. Each has a "kind":
  - "plus": something about the job that fits what they want or what they offer.
  - "watch": something that may not suit them (pay, location, seniority, hours, stack, company).
  - "check": something they care about that the posting doesn't say, worth asking about.

Rules:
- Facts about the job come only from the posting. Never invent pay, benefits, tools or details.
  If the posting doesn't say, it's a "check", not a guess. A pay figure marked as an estimate
  must be called an estimate.
- Use what you know about them (target, preferences, profile) to choose what to point out.
  Skip generic praise that would fit any job.
- Write to them directly ("you"), plainly, without hype.
- Learn from how they rated earlier summaries, listed under "Their ratings of past summaries".`;

export type SummaryInput = {
  job: string;
  target: string;
  profile: string;
  pastRatings: string[];
};

export function prompt(input: SummaryInput): string {
  const parts = [
    `What they are looking for:\n${input.target}`,
    `Their profile:\n${input.profile}`,
    `The job:\n${input.job}`,
  ];
  if (input.pastRatings.length) {
    parts.push(`Their ratings of past summaries:\n${input.pastRatings.join("\n")}`);
  }
  return parts.join("\n\n");
}
