import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { jobMatches } from "@/db/schema";
import { membersWithDiscord } from "@/features/members/members";
import { feedForUser } from "@/features/scoring/feed";
import { notifyEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { type DiscordSend, sendDiscordDirectMessage, trySend } from "./discord";

export type NotifySummary = { members: number; sent: number; failed: number; skipped: number };

const discordLimit = 2000;

/** Escapes the characters Discord treats as formatting, so job titles print as written. */
const plain = (text: string) => text.replace(/([*_~`|>\\])/g, "\\$1");

export function matchesMessage(
  items: { title: string; company: string; score: number }[],
  threshold: number,
  appUrl: string | undefined,
): string {
  const clip = (text: string, max: number) =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text;
  const header = `**${items.length} new ${items.length === 1 ? "match" : "matches"}** scoring ${threshold} or more:`;
  const link = appUrl ? `\n\nSee them all: ${appUrl}` : "";
  // Room kept for the "…and N more" line, so the end of the message is never cut off.
  const budget = discordLimit - header.length - link.length - 40;
  const lines: string[] = [];
  let used = 0;
  for (const item of items.slice(0, 10)) {
    const line = `• ${plain(clip(item.title, 120))} at ${plain(clip(item.company, 60))} (${item.score})`;
    if (used + line.length + 1 > budget) break;
    lines.push(line);
    used += line.length + 1;
  }
  const more = items.length - lines.length;
  const tail = more > 0 ? `\n…and ${more} more.` : "";
  return `${header}\n${lines.join("\n")}${tail}${link}`;
}

/**
 * After a run, tells each connected member about matches they have not heard about
 * that score at or above their threshold. Matches are marked as sent only after the
 * message goes through. Failures are logged and never stop anything.
 */
export async function notifyNewMatches(
  send: DiscordSend = sendDiscordDirectMessage,
): Promise<NotifySummary> {
  const summary: NotifySummary = { members: 0, sent: 0, failed: 0, skipped: 0 };
  const appUrl = notifyEnv().BETTER_AUTH_URL;
  for (const member of await membersWithDiscord()) {
    if (!member.userId || !member.discordUserId) continue;
    summary.members++;
    const fresh = (await feedForUser(member.userId, member.targetFitWeight)).filter(
      (item) =>
        item.best.notifiedAt === null &&
        item.best.combined !== null &&
        item.best.combined >= member.scoreThreshold,
    );
    if (fresh.length === 0) {
      summary.skipped++;
      continue;
    }
    const message = matchesMessage(
      fresh.map((i) => ({
        title: i.job.title,
        company: i.job.company,
        score: i.best.combined ?? 0,
      })),
      member.scoreThreshold,
      appUrl,
    );
    const result = await trySend(send, member.discordUserId, message);
    if (!result.ok) {
      summary.failed++;
      log.warn({ reason: result.reason, detail: result.detail }, "discord message not sent");
      continue;
    }
    summary.sent++;
    // Every match for these jobs counts as told, whichever target it was for.
    await db()
      .update(jobMatches)
      .set({ notifiedAt: new Date() })
      .where(
        and(
          eq(jobMatches.userId, member.userId),
          inArray(
            jobMatches.jobId,
            fresh.map((i) => i.job.id),
          ),
        ),
      );
  }
  return summary;
}
