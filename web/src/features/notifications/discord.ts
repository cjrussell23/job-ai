import { notifyEnv } from "@/lib/env";

/**
 * Direct messages through Discord's REST API. The bot and the member must share a
 * server, and the member must allow direct messages from that server's members.
 */

const api = "https://discord.com/api/v10";

export type DiscordSend = (discordUserId: string, content: string) => Promise<void>;

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "failed"; detail?: string };

async function call(token: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${api}${path}`, {
    method: "POST",
    headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}

/** Opens (or reuses) the DM channel with a member and posts a message to it. */
export const sendDiscordDirectMessage: DiscordSend = async (discordUserId, content) => {
  const token = notifyEnv().DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");
  const channel = await call(token, "/users/@me/channels", { recipient_id: discordUserId });
  if (!channel.ok) throw new Error(`Discord refused the DM channel (${channel.status})`);
  const { id } = (await channel.json()) as { id: string };
  const message = await call(token, `/channels/${id}/messages`, {
    content,
    // Never ping anyone, whatever a job title contains.
    allowed_mentions: { parse: [] },
  });
  if (!message.ok) throw new Error(`Discord refused the message (${message.status})`);
};

export function discordConfigured(): boolean {
  return Boolean(notifyEnv().DISCORD_BOT_TOKEN);
}

/** Sends one message and reports the outcome instead of throwing. */
export async function trySend(
  send: DiscordSend,
  discordUserId: string,
  content: string,
): Promise<SendResult> {
  if (send === sendDiscordDirectMessage && !discordConfigured())
    return { ok: false, reason: "not_configured" };
  try {
    await send(discordUserId, content);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
