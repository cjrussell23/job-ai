import { expired, json, sessionFromRequest } from "@/features/autofill/route-auth";
import { packetFor } from "@/features/autofill/sessions";

/** What the extension fills a form with (ADR 0005). */
export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return expired();
  const packet = await packetFor(session);
  return packet ? json(packet) : json({ error: "That application no longer exists." }, 404);
}
