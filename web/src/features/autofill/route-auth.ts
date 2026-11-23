import { type ApplySession, sessionForTicket } from "./sessions";

/**
 * The apply session a request from the extension belongs to, from its bearer ticket
 * (ADR 0005). The ticket travels in a header so it never lands in a URL or access log.
 */
export async function sessionFromRequest(request: Request): Promise<ApplySession | undefined> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer (\S+)$/);
  return match?.[1] ? sessionForTicket(match[1]) : undefined;
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const expired = () =>
  json({ error: "This autofill link has expired. Start autofill again from the job page." }, 401);
