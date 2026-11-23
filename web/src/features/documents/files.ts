import type { Document } from "@/db/schema";
import { documentBodySchema } from "./body";
import { readLayout } from "./layout";
import { documentPdf } from "./pdf";
import { renderResumeText } from "./render";

/** A file name for a document, from the name on it. */
export function documentFileName(doc: Document, extension: string): string {
  const body = documentBodySchema.safeParse(doc.body);
  const name = body.success ? body.data.name : "";
  const base = `${name || "document"} ${doc.kind === "resume" ? "resume" : "cover letter"}`
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${base}.${extension}`;
}

/** The document as plain text, for pasting into a form; null if it can't be read. */
export function documentAsText(doc: Document): string | null {
  const body = documentBodySchema.safeParse(doc.body);
  if (!body.success) return null;
  if (body.data.kind === "resume") return renderResumeText(body.data, readLayout(doc.layout));
  return [
    body.data.name,
    body.data.contact,
    "",
    body.data.greeting,
    ...body.data.paragraphs.map((p) => p.text),
    body.data.closing,
    body.data.name,
  ].join("\n\n");
}

/** Just the letter's own paragraphs, for a form's "cover letter" text box. */
export function coverLetterParagraphs(doc: Document): string | null {
  const body = documentBodySchema.safeParse(doc.body);
  if (!body.success || body.data.kind !== "cover_letter") return null;
  return [body.data.greeting, ...body.data.paragraphs.map((p) => p.text), body.data.closing]
    .filter(Boolean)
    .join("\n\n");
}

export async function documentAsPdf(doc: Document): Promise<Uint8Array | null> {
  const body = documentBodySchema.safeParse(doc.body);
  if (!body.success) return null;
  return documentPdf(body.data, readLayout(doc.layout));
}
