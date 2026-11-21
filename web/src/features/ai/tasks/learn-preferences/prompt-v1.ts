export const version = "learn-preferences-v1";

export const system = `You read how a person rated job suggestions and write down what they seem to
want or avoid, as short statements a later step will use when scoring new jobs.

Only state patterns the ratings actually show; one rating is not a pattern unless its
comment says so directly. Keep statements the person wrote themselves exactly as they
are. Do not repeat what their job target already says. Prefer concrete statements
("Avoids staffing agencies", "Prefers roles with a hybrid option") over vague ones.

Return at most 8 statements, each under 15 words. Return an empty list if the ratings
show no clear pattern.`;

export type LearnInput = { target: string; ratings: string[]; existing: string[] };

export function prompt(input: LearnInput): string {
  return [
    `Their job targets:\n${input.target}`,
    `Statements they wrote themselves (keep these):\n${input.existing.join("\n") || "(none)"}`,
    `Their ratings, newest first:\n${input.ratings.join("\n")}`,
  ].join("\n\n");
}
