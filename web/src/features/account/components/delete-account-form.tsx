"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccountAction, type FormState } from "@/features/account/actions";

export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccountAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Label htmlFor="confirm-email">
        Type <span className="font-mono">{email}</span> to confirm
      </Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="confirm-email"
          name="confirmEmail"
          autoComplete="off"
          className="max-w-sm"
          required
        />
        <Button type="submit" variant="destructive" disabled={pending}>
          Delete my account and data
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
