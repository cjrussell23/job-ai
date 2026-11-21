import { documentBodySchema } from "@/features/documents/body";
import { getDocument } from "@/features/documents/documents";
import { coverLetterToDocx, resumeToDocx } from "@/features/documents/docx";
import { readLayout } from "@/features/documents/layout";
import { requireMember } from "@/features/members/session";

/** A resume or cover letter as a Word document. */
export async function GET(_: Request, { params }: RouteContext<"/documents/[id]/docx">) {
  const { userId } = await requireMember();
  const { id } = await params;
  const doc = await getDocument(userId, id);
  const body = documentBodySchema.safeParse(doc?.body);
  if (!doc || !body.success) return new Response("Not found", { status: 404 });
  const file =
    body.data.kind === "resume"
      ? await resumeToDocx(body.data, readLayout(doc.layout))
      : await coverLetterToDocx(body.data);
  const name =
    `${body.data.name || "document"} ${doc.kind === "resume" ? "resume" : "cover letter"}`
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
