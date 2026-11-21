import { documentBodySchema } from "@/features/documents/body";
import { getDocument } from "@/features/documents/documents";
import { htmlToPdf } from "@/features/documents/pdf";
import { renderDocument } from "@/features/documents/render";
import { requireMember } from "@/features/members/session";

export async function GET(_: Request, { params }: RouteContext<"/documents/[id]/pdf">) {
  const { userId } = await requireMember();
  const { id } = await params;
  const doc = await getDocument(userId, id);
  const body = documentBodySchema.safeParse(doc?.body);
  if (!doc || !body.success) return new Response("Not found", { status: 404 });
  const pdf = await htmlToPdf(renderDocument(body.data));
  const name =
    `${body.data.name || "document"} ${doc.kind === "resume" ? "resume" : "cover letter"}`
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
