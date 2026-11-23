import { getDocument } from "@/features/documents/documents";
import { documentAsText } from "@/features/documents/files";
import { requireMember } from "@/features/members/session";

/** A document as plain text, for pasting into an employer's application form. */
export async function GET(_: Request, { params }: RouteContext<"/documents/[id]/text">) {
  const { userId } = await requireMember();
  const { id } = await params;
  const doc = await getDocument(userId, id);
  const text = doc ? documentAsText(doc) : null;
  if (text === null) return new Response("Not found", { status: 404 });
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
