import { exportUserData } from "@/features/account/user-data";
import { requireMember } from "@/features/members/session";

export async function GET() {
  const { userId } = await requireMember();
  const data = await exportUserData(userId);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="job-search-data-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
