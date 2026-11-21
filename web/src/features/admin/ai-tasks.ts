// Kept apart from settings.ts so client components can import it without the database.

/** Every named AI task. The model for each is chosen in the admin dashboard. */
export const aiTasks = [
  "parseResume",
  "proposeSearchTitles",
  "scoreTargetFit",
  "scoreProfileFit",
  "estimatePay",
  "draftCoverLetter",
  "tailorResume",
] as const;
export type AiTask = (typeof aiTasks)[number];

export const aiTaskLabels: Record<AiTask, string> = {
  parseResume: "Parse an uploaded resume",
  proposeSearchTitles: "Propose search titles",
  scoreTargetFit: "Score target fit",
  scoreProfileFit: "Score profile fit",
  estimatePay: "Estimate pay",
  draftCoverLetter: "Draft a cover letter",
  tailorResume: "Tailor a resume",
};
