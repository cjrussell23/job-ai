import { runTask } from "@/features/ai/run-task";
import { draftCoverLetter } from "@/features/ai/tasks/draft-cover-letter";
import { tailorResume } from "@/features/ai/tasks/tailor-resume";
import { jobForPrompt, jobsWithPostings } from "@/features/jobs/jobs";
import { memberHeader } from "@/features/members/members";
import { listItems } from "@/features/profile/profile";
import { recordedNos } from "@/features/profile/questions";
import { log } from "@/lib/log";
import { assembleCoverLetter, assembleResume, itemsForPrompt, usableItems } from "./assemble";
import { type DocumentKind, failDocument, finishDocument } from "./documents";

const failures = {
  cap_reached: "Your monthly AI allowance is used up, so drafting is paused until next month.",
  invalid_output: "The draft could not be written reliably. Try again.",
  model_error: "The AI service did not respond. Try again in a few minutes.",
} as const;

/** Worker job: writes one tailored document from the member's profile. */
export async function generateDocument(
  userId: string,
  documentId: string,
  jobId: string,
  kind: DocumentKind,
): Promise<void> {
  const [job] = await jobsWithPostings([jobId]);
  if (!job) {
    await failDocument(userId, documentId, "That job is no longer available.");
    return;
  }
  const [items, member, notes] = await Promise.all([
    listItems(userId),
    memberHeader(userId),
    recordedNos(userId),
  ]);
  const header = { name: member.name, contact: member.email };
  const profile = itemsForPrompt(usableItems(items, kind));
  if (profile === "") {
    await failDocument(userId, documentId, "Your profile is empty. Add some items first.");
    return;
  }
  const jobText = jobForPrompt(job);

  if (kind === "resume") {
    const result = await runTask(userId, tailorResume, { profile, job: jobText, notes });
    if (!result.ok) return failDocument(userId, documentId, failures[result.reason]);
    const { body, report } = assembleResume(result.output, items, header);
    if (report.dropped > 0)
      log.warn({ documentId, ...report }, "dropped resume lines without valid sources");
    return finishDocument(userId, documentId, body);
  }

  const result = await runTask(userId, draftCoverLetter, { profile, job: jobText, notes });
  if (!result.ok) return failDocument(userId, documentId, failures[result.reason]);
  const { body, report } = assembleCoverLetter(result.output, items, header);
  if (report.dropped > 0)
    log.warn({ documentId, ...report }, "dropped cover letter paragraphs without valid sources");
  return finishDocument(userId, documentId, body);
}
