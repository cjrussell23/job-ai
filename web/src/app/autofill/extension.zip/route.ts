import { extensionZip } from "@/features/autofill/extension-zip";
import { requireMember } from "@/features/members/session";
import { authEnv } from "@/lib/env";

export async function GET() {
  await requireMember();
  const zip = await extensionZip(new URL(authEnv().BETTER_AUTH_URL).origin);
  if (!zip) return new Response("The extension hasn't been built on this server.", { status: 404 });
  return new Response(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="job-search-autofill.zip"',
      "Cache-Control": "no-store",
    },
  });
}
