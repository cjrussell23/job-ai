import { and, eq, gte, sql, sum } from "drizzle-orm";
import { db } from "@/db/client";
import { aiUsage, members } from "@/db/schema";
import { getSettings } from "@/features/admin/settings";

/** The first instant of the current calendar month, in UTC. */
export function startOfMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function recordUsage(
  userId: string | null,
  entry: {
    task: string;
    model: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  },
): Promise<void> {
  await db()
    .insert(aiUsage)
    .values({ userId, ...entry });
}

export async function spendThisMonthUsd(userId: string): Promise<number> {
  const [row] = await db()
    .select({ total: sum(aiUsage.costUsd).mapWith(Number) })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, startOfMonth())));
  return row?.total ?? 0;
}

/** The member's monthly cap in cents: their own, or the app-wide default. */
export async function spendCapCents(userId: string): Promise<number> {
  const [member] = await db()
    .select({ cap: members.spendCapCents })
    .from(members)
    .where(eq(members.userId, userId));
  if (member?.cap !== null && member?.cap !== undefined) return member.cap;
  return (await getSettings()).defaultSpendCapCents;
}

export async function isOverCap(userId: string): Promise<boolean> {
  const [spent, cap] = await Promise.all([spendThisMonthUsd(userId), spendCapCents(userId)]);
  return spent * 100 >= cap;
}

/** Spend per user this month, for the admin dashboard. Totals only, no content. */
export async function spendThisMonthByUser(): Promise<Map<string, number>> {
  const rows = await db()
    .select({ userId: aiUsage.userId, total: sql<number>`sum(${aiUsage.costUsd})`.mapWith(Number) })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, startOfMonth()))
    .groupBy(aiUsage.userId);
  return new Map(rows.flatMap((row) => (row.userId ? [[row.userId, row.total] as const] : [])));
}
