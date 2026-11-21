"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionState, runNowAction, runTimeAction } from "@/features/admin/actions";

export function RunControls({ dailyRunTime }: { dailyRunTime: string }) {
  const [timeState, timeAction, timePending] = useActionState<ActionState, FormData>(
    runTimeAction,
    {},
  );
  const [runState, runAction, runPending] = useActionState<ActionState>(runNowAction, {});
  return (
    <div className="flex flex-wrap items-end gap-6">
      <form action={timeAction} className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="run-time">Daily run time (Calgary)</Label>
          <Input
            id="run-time"
            name="dailyRunTime"
            type="time"
            defaultValue={dailyRunTime}
            required
            className="w-32"
          />
        </div>
        <Button type="submit" variant="outline" disabled={timePending}>
          Save
        </Button>
      </form>
      <form action={runAction}>
        <Button type="submit" disabled={runPending}>
          {runPending ? "Starting…" : "Run now"}
        </Button>
      </form>
      <Status state={timeState} />
      <Status state={runState} />
    </div>
  );
}

function Status({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  }
  return state.message ? <p className="text-sm text-muted-foreground">{state.message}</p> : null;
}
