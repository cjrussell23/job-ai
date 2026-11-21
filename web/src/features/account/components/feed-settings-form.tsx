"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FormState, feedSettingsAction } from "@/features/account/actions";

type Props = {
  scoreThreshold: number;
  targetFitWeight: number;
  summariesOn: boolean;
  summaryScore: number;
  /** The admin's minimum; summaries never go below it. */
  summaryMinimum: number;
};

export function FeedSettingsForm(props: Props) {
  const { scoreThreshold, targetFitWeight } = props;
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
      <div className="flex flex-col gap-2 rounded-md border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="summariesOn" defaultChecked={props.summariesOn} />
          AI summaries of strong matches
        </label>
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="summary-score">Summarize matches scoring at least</Label>
          <Input
            id="summary-score"
            name="summaryScore"
            type="number"
            min="0"
            max="100"
            defaultValue={props.summaryScore}
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          A short read of what matters to you about each strong match, written after each morning's
          run and each rescore. Rate them to make later ones better. Each summary is one AI call
          from your monthly allowance; the admin's minimum is {props.summaryMinimum}, so matches
          below that are never summarized.
        </p>
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
