import { documentBodySchema } from "@/features/documents/body";
import { getDocument } from "@/features/documents/documents";
import { readLayout } from "@/features/documents/layout";
import { renderResumeText } from "@/features/documents/render";
import { requireMember } from "@/features/members/session";

/** A document as plain text, for pasting into an employer's application form. */
export async function GET(_: Request, { params }: RouteContext<"/documents/[id]/text">) {
  const { userId } = await requireMember();
  const { id } = await params;
  const doc = await getDocument(userId, id);
  const body = documentBodySchema.safeParse(doc?.body);
  if (!doc || !body.success) return new Response("Not found", { status: 404 });
  const text =
    body.data.kind === "resume"
      ? renderResumeText(body.data, readLayout(doc.layout))
      : [
          body.data.name,
          body.data.contact,
          "",
          body.data.greeting,
          ...body.data.paragraphs.map((p) => p.text),
          body.data.closing,
          body.data.name,
        ].join("\n\n");
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
