// Kept apart from settings.ts so client components can import it without the database.

/** Every named AI task. The model for each is chosen in the admin dashboard. */
export const aiTasks = [
  "parseResume",
  "proposeSearchTitles",
  "scoreTargetFit",
  "scoreProfileFit",
  "estimatePay",
  "learnPreferences",
  "draftCoverLetter",
  "tailorResume",
  "reviewProfile",
  "pickResumeItems",
  "reviewResume",
  "summarizeMatch",
  "draftInterviewQuestions",
  "rateInterviewAnswer",
  "describeCompany",
  "answerApplicationQuestions",
] as const;
export type AiTask = (typeof aiTasks)[number];

export const aiTaskLabels: Record<AiTask, string> = {
  parseResume: "Parse an uploaded resume",
  proposeSearchTitles: "Propose search titles",
  scoreTargetFit: "Score target fit",
  scoreProfileFit: "Score profile fit",
  estimatePay: "Estimate pay",
  learnPreferences: "Learn preferences from feedback",
  draftCoverLetter: "Draft a cover letter",
  tailorResume: "Tailor a resume",
  reviewProfile: "Review a profile (suggestions and questions)",
  pickResumeItems: "Pick resume items for a job target",
  reviewResume: "Give feedback on a resume",
  summarizeMatch: "Summarize a strong match",
  draftInterviewQuestions: "Draft interview practice questions",
  rateInterviewAnswer: "Rate an interview practice answer",
  describeCompany: "Describe a company (with web search)",
  answerApplicationQuestions: "Answer application form questions (autofill)",
};
