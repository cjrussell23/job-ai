import type { Member } from "@/db/schema";

export type SignInDecision = "allowed" | "not_invited" | "suspended";

/** Whether a Google address may sign in, given its member record (if any). */
export function signInDecision(member: Pick<Member, "state"> | undefined): SignInDecision {
  if (!member) return "not_invited";
  return member.state === "suspended" ? "suspended" : "allowed";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
