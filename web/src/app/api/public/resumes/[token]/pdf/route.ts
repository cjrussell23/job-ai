import { htmlToPdf } from "@/features/documents/pdf";
import { sharedResume } from "@/features/documents/public";
import { renderDocument } from "@/features/documents/render";

// Rendering a PDF starts Chromium, so a public link must not do it on every request:
// keep the latest render of each shared resume until the resume is saved again.
const rendered = new Map<string, { at: number; pdf: Uint8Array }>();
const maxCached = 20;

/** A shared standing resume as a PDF (ADR 0004). No sign-in. */
export async function GET(_: Request, { params }: RouteContext<"/api/public/resumes/[token]/pdf">) {
  const { token } = await params;
  const shared = await sharedResume(token);
  if (!shared) return new Response("Not found", { status: 404 });
  const at = shared.updatedAt.getTime();
  let pdf = rendered.get(shared.id)?.at === at ? rendered.get(shared.id)?.pdf : undefined;
  if (!pdf) {
    pdf = await htmlToPdf(renderDocument(shared.body, { layout: shared.layout }));
    rendered.delete(shared.id);
    if (rendered.size >= maxCached) {
      const oldest = rendered.keys().next().value;
      if (oldest) rendered.delete(oldest);
    }
    rendered.set(shared.id, { at, pdf });
  }
  const name = `${shared.body.name || "resume"} resume`
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}.pdf"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
