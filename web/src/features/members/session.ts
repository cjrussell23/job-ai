import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { getMemberByUserId, type Member } from "./members";

export type SignedInMember = {
  userId: string;
  name: string;
  member: Member;
};

/**
 * The signed-in, active member for this request, or a redirect to sign-in.
 * Every page and server action that touches user-owned data starts here.
 */
export async function requireMember(): Promise<SignedInMember> {
  const current = await auth().api.getSession({ headers: await headers() });
  if (!current) redirect("/sign-in");
  const member = await getMemberByUserId(current.user.id);
  if (member?.state !== "active") redirect("/sign-in?error=suspended");
  return { userId: current.user.id, name: current.user.name, member };
}

/** As requireMember, and the member must be the admin. */
export async function requireAdmin(): Promise<SignedInMember> {
  const signedIn = await requireMember();
  if (signedIn.member.role !== "admin") redirect("/");
  return signedIn;
}
