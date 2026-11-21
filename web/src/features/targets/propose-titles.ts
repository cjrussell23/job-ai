import { runTask } from "@/features/ai/run-task";
import { proposeSearchTitles } from "@/features/ai/tasks/propose-search-titles";
import { profileHeadlines } from "@/features/profile/profile";
import { getTarget, setSearchTitleProposal } from "./targets";

/** Worker job: asks the model for search titles for a job target. */
export async function proposeTitlesForTarget(userId: string, targetId: string): Promise<void> {
  const target = await getTarget(userId, targetId);
  if (!target) return;
  const headlines = await profileHeadlines(userId);
  const result = await runTask(userId, proposeSearchTitles, {
    roleType: target.roleType,
    note: target.note,
    ...headlines,
  });
  if (!result.ok) {
    await setSearchTitleProposal(userId, targetId, { state: "failed" });
    return;
  }
  // Already-approved titles are not proposed again.
  const titles = result.output.titles.filter((t) => !target.searchTitles.includes(t));
  await setSearchTitleProposal(userId, targetId, { state: "proposed", titles });
}
