import { db } from "@/db/client";
import { members, user } from "@/db/schema";

/** An active, signed-in member. Returns their user id. */
export async function createMember(email: string, spendCapCents: number | null = null) {
  const userId = `user-${email}`;
  await db().insert(user).values({ id: userId, name: email, email });
  await db().insert(members).values({ email, userId, state: "active", spendCapCents });
  return userId;
}
