import { expired, sessionFromRequest } from "@/features/autofill/route-auth";
import { sessionDocument } from "@/features/autofill/sessions";
import { documentAsPdf, documentFileName } from "@/features/documents/files";

/** The application's approved resume or cover letter as a PDF, for the form's upload field. */
export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return expired();
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "resume" && kind !== "cover_letter")
    return new Response("Unknown document", { status: 400 });
  const doc = await sessionDocument(session, kind);
  const pdf = doc ? await documentAsPdf(doc) : null;
  if (!doc || !pdf) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${documentFileName(doc, "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
}
