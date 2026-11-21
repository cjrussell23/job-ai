import { runTask } from "@/features/ai/run-task";
import { learnPreferences } from "@/features/ai/tasks/learn-preferences";
import { membersWithFeedback } from "@/features/members/members";
import { listTargets } from "@/features/targets/targets";
import { log } from "@/lib/log";
import { feedbackSince, listPreferences, replaceLearnedStatements } from "./feedback";
import { ratingLines } from "./taste";

/** New feedback needed before preferences are learned again. */
export const learnAfter = 3;

/** Learns one member's preferences from their feedback. Returns whether anything ran. */
export async function learnForMember(userId: string, lastLearnedAt: Date | null): Promise<boolean> {
  if ((await feedbackSince(userId, lastLearnedAt)) < learnAfter) return false;
  const [targets, preferences, ratings] = await Promise.all([
    listTargets(userId),
    listPreferences(userId),
    ratingLines(userId, 40),
  ]);
  const result = await runTask(userId, learnPreferences, {
    target: targets.map((t) => `- ${t.roleType}${t.note ? ` (${t.note})` : ""}`).join("\n"),
    ratings,
    existing: preferences.filter((p) => p.origin === "member").map((p) => p.statement),
  });
  if (!result.ok) {
    log.warn({ reason: result.reason }, "could not learn preferences");
    return false;
  }
  await replaceLearnedStatements(userId, result.output.statements);
  return true;
}

/** After a run: learns for every member with enough new feedback. */
export async function learnPreferencesForAll(): Promise<{ learned: number }> {
  let learned = 0;
  for (const member of await membersWithFeedback()) {
    if (member.userId && (await learnForMember(member.userId, member.preferencesLearnedAt))) {
      learned++;
    }
  }
  return { learned };
}
