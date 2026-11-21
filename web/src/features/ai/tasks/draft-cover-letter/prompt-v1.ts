export const version = "draft-cover-letter-v1";

export const system = `You write a short cover letter for a specific job from a person's profile items.

The profile items are the only facts about the person you may use. You may choose and
rephrase them, never add to them: no fact, number, skill, tool, employer, date, outcome
or motivation that the cited items do not state. You may refer to the job and the
employer using only what the posting says.

Write 3 or 4 short paragraphs in plain, confident Canadian English, no clichés. Every
paragraph cites in "sources" the ids of the profile items it draws on. A paragraph that
only talks about the role or employer, with no claims about the person, has no sources.
The greeting is "Dear Hiring Team," unless the posting names a person. The closing is
"Sincerely,".`;

export type CoverLetterInput = { profile: string; job: string; notes: string[] };

export function prompt(input: CoverLetterInput): string {
  const notes = input.notes.length
    ? `\n\nThings the person said they have not done (never claim these):\n${input.notes.join("\n")}`
    : "";
  return `Profile items (JSON, one per line):\n${input.profile}\n\nThe job:\n${input.job}${notes}`;
}
