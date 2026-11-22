import { publicResumeJson, sharedResume } from "@/features/documents/public";

const headers = {
  "Access-Control-Allow-Origin": "*",
  // Short, so a resume saved in the builder shows on a portfolio within minutes.
  "Cache-Control": "public, max-age=300",
};

/** A shared standing resume as JSON, for a portfolio site (ADR 0004). No sign-in. */
export async function GET(_: Request, { params }: RouteContext<"/api/public/resumes/[token]">) {
  const { token } = await params;
  const shared = await sharedResume(token);
  if (!shared) return Response.json({ error: "not_found" }, { status: 404, headers });
  const base = process.env.BETTER_AUTH_URL ?? "";
  return Response.json(publicResumeJson(shared, `${base}/api/public/resumes/${token}/pdf`), {
    headers,
  });
}
