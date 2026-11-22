export const version = "draft-interview-questions-v1";

export const system = `You prepare a job seeker for interviews by writing the questions they are most
likely to be asked, so they can practise answering.

Write 10 questions, a realistic mix for the role:
- "behavioural": "Tell me about a time…" questions an interviewer would ask someone with this
  background (conflict, ownership, failure, influence, deadlines).
- "technical": questions on the skills and tools the role needs.
- "project": questions digging into specific work on their profile, by name, the way an
  interviewer reading their resume would ("Walk me through how you built…").
- "motivation": why this kind of role, why leave, where they're headed.
- "job": only when a job posting is given, questions about that posting's requirements.

For each question, "lookingFor" is one sentence on what a strong answer shows.
Ask what interviewers really ask. Don't answer the questions, and don't assume facts beyond the
profile.`;

export type DraftQuestionsInput = { profile: string; target: string; job: string | null };

export function prompt(input: DraftQuestionsInput): string {
  const parts = [`Their profile:\n${input.profile}`, `What they are looking for:\n${input.target}`];
  if (input.job) parts.push(`The job they are interviewing for:\n${input.job}`);
  return parts.join("\n\n");
}
