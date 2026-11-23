import { getDocument } from "@/features/documents/documents";
import { documentAsPdf, documentFileName } from "@/features/documents/files";
import { requireMember } from "@/features/members/session";

export async function GET(_: Request, { params }: RouteContext<"/documents/[id]/pdf">) {
  const { userId } = await requireMember();
  const { id } = await params;
  const doc = await getDocument(userId, id);
  const pdf = doc ? await documentAsPdf(doc) : null;
  if (!doc || !pdf) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${documentFileName(doc, "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
}
