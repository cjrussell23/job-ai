"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionState, inviteAction } from "@/features/admin/actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Label htmlFor="invite-email">Invite a Google address</Label>
      <div className="flex gap-2">
        <Input id="invite-email" name="email" type="email" required placeholder="name@gmail.com" />
        <Button type="submit" disabled={pending}>
          Invite
        </Button>
      </div>
      {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
