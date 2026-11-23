import { runTask } from "@/features/ai/run-task";
import { draftCoverLetter } from "@/features/ai/tasks/draft-cover-letter";
import { tailorResume } from "@/features/ai/tasks/tailor-resume";
import { jobForPrompt, jobsWithPostings } from "@/features/jobs/jobs";
import { documentHeader } from "@/features/profile/contact";
import { listItems } from "@/features/profile/profile";
import { recordedNos } from "@/features/profile/questions";
import { log } from "@/lib/log";
import { assembleCoverLetter, assembleResume, itemsForPrompt, usableItems } from "./assemble";
import { resumeBodySchema } from "./body";
import { type DocumentKind, documentsForJob, failDocument, finishDocument } from "./documents";
import { readLayout } from "./layout";
import { renderResumeText } from "./render";
import { tailoredLayout } from "./standing";

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
  /** A cover letter waiting for this resume, written once the resume is done. */
  thenCoverLetterId?: string,
): Promise<void> {
  const [job] = await jobsWithPostings([jobId]);
  if (!job) {
    await failDocument(userId, documentId, "That job is no longer available.");
    return;
  }
  const [items, header, notes] = await Promise.all([
    listItems(userId),
    documentHeader(userId),
    recordedNos(userId),
  ]);
  const profile = itemsForPrompt(usableItems(items, kind));
  if (profile === "") {
    await failDocument(userId, documentId, "Your profile is empty. Add some items first.");
    return;
  }
  const jobText = jobForPrompt(job);

  if (kind === "resume") {
    const layout = await tailoredLayout(userId);
    const result = await runTask(userId, tailorResume, {
      profile,
      job: jobText,
      notes,
      pages: layout.pages,
    });
    if (result.ok) {
      const { body, report } = assembleResume(result.output, items, header);
      if (report.dropped > 0)
        log.warn({ documentId, ...report }, "dropped resume lines without valid sources");
      await finishDocument(userId, documentId, body, layout);
    } else {
      await failDocument(userId, documentId, failures[result.reason]);
    }
    // The letter is written after the resume so it can say what the resume doesn't.
    if (thenCoverLetterId) await generateDocument(userId, thenCoverLetterId, jobId, "cover_letter");
    return;
  }

  const resume = (await documentsForJob(userId, jobId)).find(
    (d) => d.kind === "resume" && (d.state === "draft" || d.state === "approved"),
  );
  const resumeBody = resumeBodySchema.safeParse(resume?.body);
  const result = await runTask(userId, draftCoverLetter, {
    profile,
    job: jobText,
    notes,
    resume:
      resume && resumeBody.success
        ? renderResumeText(resumeBody.data, readLayout(resume.layout))
        : null,
  });
  if (!result.ok) return failDocument(userId, documentId, failures[result.reason]);
  const { body, report } = assembleCoverLetter(result.output, items, header);
  if (report.dropped > 0)
    log.warn({ documentId, ...report }, "dropped cover letter paragraphs without valid sources");
  return finishDocument(userId, documentId, body);
}
