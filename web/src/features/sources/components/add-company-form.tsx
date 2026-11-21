"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addCompanyAction, type FormState } from "@/features/sources/actions";

export function AddCompanyForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addCompanyAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-url">Job board link</Label>
          <Input id="company-url" name="url" required placeholder="https://jobs.lever.co/company" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-name">Company name (optional)</Label>
          <Input id="company-name" name="name" placeholder="Taken from the board if blank" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Checking…" : "Watch company"}
        </Button>
        {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
