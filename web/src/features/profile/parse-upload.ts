import { runTask } from "@/features/ai/run-task";
import { parseResume } from "@/features/ai/tasks/parse-resume";
import { getUpload, markUploadFailed, saveParsedItems } from "./profile";

const failureMessages = {
  cap_reached: "Your monthly AI allowance is used up. Try again next month.",
  invalid_output: "The resume could not be read reliably. Try again, or add items by hand.",
  model_error: "The AI service did not respond. Try again in a few minutes.",
} as const;

/** Worker job: turns an uploaded resume's text into profile items. */
export async function parseUpload(userId: string, uploadId: string): Promise<void> {
  const upload = await getUpload(userId, uploadId);
  if (upload?.state !== "parsing") return;
  const result = await runTask(userId, parseResume, { resumeText: upload.text });
  if (!result.ok) {
    await markUploadFailed(userId, uploadId, failureMessages[result.reason]);
    return;
  }
  await saveParsedItems(userId, uploadId, result.output.items);
}
