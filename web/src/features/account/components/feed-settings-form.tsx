"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FormState, feedSettingsAction } from "@/features/account/actions";

type Props = { scoreThreshold: number; targetFitWeight: number };

export function FeedSettingsForm({ scoreThreshold, targetFitWeight }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(feedSettingsAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="score-threshold">Notify me about matches scoring at least</Label>
          <Input
            id="score-threshold"
            name="scoreThreshold"
            type="number"
            min="0"
            max="100"
            defaultValue={scoreThreshold}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="target-fit-weight">Weight on target fit (%)</Label>
          <Input
            id="target-fit-weight"
            name="targetFitWeight"
            type="number"
            min="0"
            max="100"
            defaultValue={targetFitWeight}
            required
          />
          <p className="text-xs text-muted-foreground">
            The rest goes to profile fit. 60 means a job you want counts for more than one you are
            qualified for.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          Save
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
