import { expired, json, sessionFromRequest } from "@/features/autofill/route-auth";
import { finishSchema, finishSession } from "@/features/autofill/sessions";

/** The member is done: save chosen answers, and mark the application applied if they sent it. */
export async function POST(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return expired();
  const parsed = finishSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "That couldn't be read." }, 400);
  return json(await finishSession(session, parsed.data));
}
