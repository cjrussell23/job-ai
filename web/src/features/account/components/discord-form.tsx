"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { discordAction, type FormState } from "@/features/account/actions";

export function DiscordForm({ discordUserId }: { discordUserId: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(discordAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="discord-id">Your Discord user ID</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="discord-id"
            name="discordUserId"
            inputMode="numeric"
            placeholder="123456789012345678"
            defaultValue={discordUserId ?? ""}
            className="max-w-xs"
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save and send a test"}
          </Button>
        </div>
      </div>
      {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <ol className="list-decimal pl-5 text-sm text-muted-foreground">
        <li>In Discord, open Settings → Advanced and turn on Developer Mode.</li>
        <li>Click your own name, then Copy User ID, and paste it above.</li>
        <li>
          Be in a Discord server with the Job Search bot, and allow direct messages from that
          server's members (server menu → Privacy Settings).
        </li>
      </ol>
      <p className="text-sm text-muted-foreground">Leave the field empty to stop messages.</p>
    </form>
  );
}
