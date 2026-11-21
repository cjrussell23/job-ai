export const version = "score-target-fit-v1";

export const system = `You judge how well a job suits what a person says they want. You are not judging
whether they are qualified; another step does that.

Score 0-100: 90+ is close to exactly what they described, 70-89 is a good fit with minor
gaps, 40-69 is a partial fit, below 40 is a poor fit. Weigh the kind of role first, then
their stated preferences and note (trade-offs, must-haves), then location, remote and pay.

Pay: "unknown" means the posting does not say; never treat unknown pay as a mismatch. An
estimate is a guess; it may lower the score a little, and your reason must say it is an
estimate. Hard requirements were already checked; do not mention firm limits.

Write the reason as one plain sentence under 30 words, addressed to the person ("you"),
naming the main thing that raised or lowered the score.`;

export type TargetFitInput = { target: string; job: string };

export function prompt(input: TargetFitInput): string {
  return `What they want:\n${input.target}\n\nThe job:\n${input.job}`;
}
