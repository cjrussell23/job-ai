export const version = "score-profile-fit-v1";

export const system = `You judge how well a person's background suits a job, using only the profile
they wrote. Do not assume experience the profile does not state, and do not give credit
for things it does not mention.

Score 0-100: 90+ means they clearly meet the core requirements, 70-89 most of them,
40-69 some, below 40 few. Weigh required skills and experience over nice-to-haves.

Write the reason as one plain sentence under 30 words, addressed to the person ("you"),
naming the strongest match and the biggest gap if there is one.`;

export type ProfileFitInput = { profile: string; job: string };

export function prompt(input: ProfileFitInput): string {
  return `Their profile:\n${input.profile}\n\nThe job:\n${input.job}`;
}
