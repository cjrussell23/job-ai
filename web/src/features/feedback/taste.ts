import { jobsWithPostings } from "@/features/jobs/jobs";
import { activePreferenceStatements, feedbackReasons, recentFeedback } from "./feedback";

const ratingLabels = {
  up: "Liked",
  down: "Not for them",
  dismissed: "Dismissed",
  saved: "Saved",
  applied: "Applied",
} as const;

/** Lines like "Liked: Backend Developer at Acme" for the scoring and learning prompts. */
export async function ratingLines(userId: string, limit: number): Promise<string[]> {
  const recent = await recentFeedback(userId, limit);
  const jobs = new Map(
    (await jobsWithPostings([...new Set(recent.map((f) => f.jobId))])).map((j) => [j.id, j]),
  );
  return recent.flatMap((f) => {
    const job = jobs.get(f.jobId);
    if (!job) return [];
    const reason = f.reason ? ` (${feedbackReasons[f.reason].toLowerCase()})` : "";
    const comment = f.comment ? `: "${f.comment}"` : "";
    return [`${ratingLabels[f.kind]}: ${job.title} at ${job.company}${reason}${comment}`];
  });
}

/** What scoring needs to know about a member's taste: their preferences and recent ratings. */
export async function memberTaste(
  userId: string,
): Promise<{ preferences: string[]; ratings: string[] }> {
  const [preferences, ratings] = await Promise.all([
    activePreferenceStatements(userId),
    ratingLines(userId, 10),
  ]);
  return { preferences, ratings };
}
