"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionState, aiSettingsAction } from "@/features/admin/actions";
import { type AiTask, aiTaskLabels, aiTasks } from "@/features/admin/ai-tasks";

type Props = { models: Record<AiTask, string>; defaultSpendCapCents: number };

export function AiSettingsForm({ models, defaultSpendCapCents }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(aiSettingsAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {aiTasks.map((task) => (
          <div key={task} className="flex flex-col gap-1.5">
            <Label htmlFor={`model-${task}`}>{aiTaskLabels[task]}</Label>
            <Input
              id={`model-${task}`}
              name={`model.${task}`}
              defaultValue={models[task]}
              required
            />
          </div>
        ))}
      </div>
      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor="default-cap">Default monthly cap per member (dollars)</Label>
        <Input
          id="default-cap"
          name="defaultSpendCap"
          type="number"
          min="0"
          step="0.01"
          defaultValue={(defaultSpendCapCents / 100).toFixed(2)}
          required
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          Save AI settings
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
