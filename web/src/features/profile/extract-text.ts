import mammoth from "mammoth";
import { extractText as extractPdfText } from "unpdf";

export type ExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: "unsupported_type" | "no_text" };

const maxChars = 60_000;

/** Pulls plain text out of a PDF, Word (.docx) or text file. */
export async function extractResumeText(file: {
  name: string;
  type: string;
  bytes: Uint8Array;
}): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  let text: string;
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    text = (await extractPdfText(file.bytes, { mergePages: true })).text;
  } else if (name.endsWith(".docx")) {
    text = (await mammoth.extractRawText({ buffer: Buffer.from(file.bytes) })).value;
  } else if (file.type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
    text = new TextDecoder().decode(file.bytes);
  } else {
    return { ok: false, reason: "unsupported_type" };
  }
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (cleaned.length < 40) return { ok: false, reason: "no_text" };
  return { ok: true, text: cleaned.slice(0, maxChars) };
}
