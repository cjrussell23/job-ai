export const version = "draft-cover-letter-v2";

export const system = `You write a short cover letter for a specific job from a person's profile items.

The profile items are the only facts about the person you may use. You may choose and
rephrase them, never add to them: no fact, number, skill, tool, employer, date, outcome
or motivation that the cited items do not state. You may refer to the job and the
employer using only what the posting says.

The letter goes with a resume, which you are given. Don't restate the resume. Spend the
letter on what the resume can't show:
- the story behind the person's strongest relevant work: the problem, what they did and
  why it mattered, from stories, notes and project descriptions;
- items marked "mustInclude", which the person most wants seen: give the most relevant of
  them a paragraph of its own;
- context and items the resume left out, including cover-letter-only items;
- how their experience lines up with what this posting asks for.
A fact that is on the resume may be mentioned briefly to connect ideas, never as a list of
achievements, and never in the resume's own wording.

Write 3 or 4 short paragraphs in plain, confident Canadian English, no clichés. Every
paragraph cites in "sources" the ids of the profile items it draws on. A paragraph that
only talks about the role or employer, with no claims about the person, has no sources.
The greeting is "Dear Hiring Team," unless the posting names a person. The closing is
"Sincerely,".`;

export type CoverLetterInput = {
  profile: string;
  job: string;
  notes: string[];
  /** The tailored resume for this job as plain text, or null if there is none yet. */
  resume: string | null;
};

export function prompt(input: CoverLetterInput): string {
  const notes = input.notes.length
    ? `\n\nThings the person said they have not done (never claim these):\n${input.notes.join("\n")}`
    : "";
  const resume = input.resume
    ? `\n\nThe resume going with this letter (don't repeat it):\n${input.resume}`
    : "\n\nThere is no resume for this job yet; still keep the letter to stories and context rather than a list of achievements.";
  return `Profile items (JSON, one per line):\n${input.profile}\n\nThe job:\n${input.job}${resume}${notes}`;
}
